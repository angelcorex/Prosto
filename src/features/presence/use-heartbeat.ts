'use client';

import { useEffect, useRef } from 'react';
import { createClient, getBrowserUser } from '@/lib/supabase/client';
import { publishPresence, markOnline, markOffline } from './use-presence-store';
import { detectDevice } from './device';

/** Stable id for this tab/app session (persists across reloads in the tab). */
function getSessionId(): string {
  try {
    const k = 'prosto:sid';
    let id = sessionStorage.getItem(k);
    if (!id) { id = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`); sessionStorage.setItem(k, id); }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Keeps the current user present and broadcasts their status.
 *
 * - Realtime Presence detects connectivity for the online/offline dot.
 * - A broadcast keeps the chosen status + fresh last_seen flowing instantly.
 * - A DB session heartbeat records which device this client runs on, so others
 *   can show one icon per active device (survives AFK/backgrounded tabs within
 *   the activity window — unlike a raw realtime connection).
 */
export function useHeartbeat() {
  const sbRef = useRef(createClient());

  useEffect(() => {
    const sb = sbRef.current;
    let alive = true;
    let myId: string | null = null;
    const device = detectDevice();
    const sessionId = getSessionId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let presence: any = null;

    // Round-trip of the previous session_heartbeat RPC (PostgREST + network),
    // fed back on the next beat so the admin panel can chart gateway latency
    // over time. Undefined until the first beat completes.
    let lastGatewayMs: number | undefined;

    const beat = () => {
      if (!alive || !myId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('heartbeat').then(() => {}, () => {});
      const started = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any)
        .rpc('session_heartbeat', { p_session: sessionId, p_device: device, p_gateway_ms: lastGatewayMs ?? null })
        .then(() => { lastGatewayMs = Date.now() - started; }, () => {});
      publishPresence(myId); // keep chosen status, refresh last_seen, broadcast
    };

    getBrowserUser().then(async (user) => {
      myId = user?.id ?? null;
      if (!alive || !myId) return;

      // Seed the real chosen status so we never flash a wrong one.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: me } = await (sb as any)
        .from('profiles').select('status').eq('id', myId).maybeSingle();
      publishPresence(myId, me?.status ?? 'online');

      // Realtime presence: track self, observe everyone's connectivity (dot).
      presence = sb.channel('online-presence', { config: { presence: { key: myId } } });
      presence
        .on('presence', { event: 'sync' }, () => {
          const state = presence.presenceState() as Record<string, unknown[]>;
          Object.keys(state).forEach((uid) => markOnline(uid));
        })
        .on('presence', { event: 'join' }, ({ key }: { key: string }) => markOnline(key))
        .on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
          const state = presence.presenceState() as Record<string, unknown[]>;
          if (!state[key] || state[key].length === 0) markOffline(key);
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') presence.track({ at: Date.now() });
        });

      beat();
    });

    const id = setInterval(beat, 30000);

    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', beat);
    window.addEventListener('online', beat);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', beat);
      window.removeEventListener('online', beat);
      // Drop this session promptly so its device icon disappears.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('end_session', { p_session: sessionId }).then(() => {}, () => {});
      if (presence) sb.removeChannel(presence);
    };
  }, []);
}
