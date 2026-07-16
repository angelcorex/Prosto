'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { createClient, getBrowserUser } from '@/lib/supabase/client';
import { getMyConversations } from '@/lib/supabase/my-conversations';
import { useT } from '@/providers/i18n-provider';
import { ensurePushSubscribed } from './push';

const SOUND_SRC = '/sounds/notification.wav';
const SOUND_THROTTLE_MS = 1200;

let audio: HTMLAudioElement | null = null;
let lastPlay = 0;
// Audio playback is only allowed after the user has interacted with the page
// (browser autoplay policy). We flip this on the first gesture in `unlock()`.
// Until then we skip playSound entirely so the browser never logs an
// "Autoplay is only allowed…" warning for a play() call it would reject.
let audioUnlocked = false;

// Global notification prefs (from get_notify_prefs). Module-level so playSound /
// toast checks can read them without threading state through every call. The
// hook loads + refreshes them. Defaults = everything on.
type NotifyKind = 'dm' | 'server' | 'mention' | 'friend';
let prefs = {
  sound_enabled: true, dm_sound: true, server_sound: true,
  mention_sound: true, friend_sound: true, toasts_enabled: true,
};
function soundAllowed(kind: NotifyKind): boolean {
  if (!prefs.sound_enabled) return false;
  return kind === 'dm' ? prefs.dm_sound
    : kind === 'server' ? prefs.server_sound
    : kind === 'mention' ? prefs.mention_sound
    : prefs.friend_sound;
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SOUND_SRC);
    audio.volume = 0.5;
  }
  return audio;
}

function playSound(kind: NotifyKind = 'dm') {
  if (!audioUnlocked || !soundAllowed(kind)) return;
  const now = Date.now();
  if (now - lastPlay < SOUND_THROTTLE_MS) return;
  lastPlay = now;
  try {
    const a = ensureAudio();
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

interface ConvInfo {
  title: string;
  icon: string | null;
  /** Public id for the /messages/<pid> route (so the toast can navigate). */
  pid: string | null;
}

/**
 * Plays a sound on every incoming message (web + desktop) and shows a native
 * OS toast on desktop. Suppressed entirely when the user's status is "dnd"
 * (Do Not Disturb), and skipped for the conversation you're actively viewing.
 *
 * Mount once.
 */
export function useMessageNotifier() {
  const pathname = usePathname();
  const tm = useT('messages');

  const sbRef = useRef(createClient());
  const myIdRef = useRef<string | null>(null);
  const myUsernameRef = useRef<string>('');
  const statusRef = useRef<string>('online');
  const convsRef = useRef<Map<string, ConvInfo>>(new Map());
  const pidToConvRef = useRef<Map<string, string>>(new Map());
  const activeConvRef = useRef<string | null>(null);

  const match = pathname.match(/^\/messages\/([^/]+)/);
  const activePublicId = match ? match[1] : null;

  useEffect(() => {
    activeConvRef.current = activePublicId
      ? pidToConvRef.current.get(activePublicId) ?? null
      : null;
  }, [activePublicId]);

  useEffect(() => {
    const sb = sbRef.current;
    let active = true;
    const rnd = Math.random().toString(36).slice(2);

    // Unlock audio on the first user gesture (browser autoplay policy).
    const unlock = () => {
      audioUnlocked = true;
      try {
        const a = ensureAudio();
        void a
          .play()
          .then(() => {
            a.pause();
            a.currentTime = 0;
          })
          .catch(() => {});
      } catch {
        /* ignore */
      }
      // Ask for browser notification permission so web users get a Telegram-style
      // popup even when the tab is in the background (desktop uses native toasts).
      // Once granted, register this device for Web Push so notifications also
      // arrive when the app is fully closed / the phone is locked.
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') void ensurePushSubscribed();
          }).catch(() => {});
        } else if (Notification.permission === 'granted') {
          void ensurePushSubscribed();
        }
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // Native toast on desktop; browser Notification on web (only when the tab
    // isn't focused, so it behaves like a real push and doesn't nag while you
    // are actively using the app).
    function showToast(title: string, body: string, icon?: string | null, url?: string | null) {
      const desktop = window.prostoDesktop;
      if (desktop?.isDesktop) {
        // Desktop shell handles focusing + routing from the notification click.
        desktop.notify({ title, body, icon: icon ?? undefined, url: url ?? undefined });
        return;
      }
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        !document.hasFocus()
      ) {
        try {
          const n = new Notification(title, { body, icon: icon ?? undefined });
          // Click → focus the app and navigate to the message (Telegram-style).
          n.onclick = () => {
            window.focus();
            if (url) {
              try { window.history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }
              catch { window.location.href = url; }
            }
            n.close();
          };
        } catch {
          /* ignore */
        }
      }
    }

    async function loadConvs(force = false) {
      const user = await getBrowserUser();
      if (!user) return;
      myIdRef.current = user.id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: me } = await (sb as any)
        .from('profiles').select('status, username').eq('id', user.id).maybeSingle();
      if (me?.status) statusRef.current = me.status;
      if (me?.username) myUsernameRef.current = me.username;

      const data = await getMyConversations(user.id, force);
      if (!active || !data) return;

      const convs = new Map<string, ConvInfo>();
      const pidMap = new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.forEach((r: any) => {
        const isGroup = !!r.is_group;
        const title = isGroup
          ? (r.group_name || tm('unnamedGroup'))
          : (r.other_display_name || r.other_username || tm('newMessage'));
        const icon = isGroup ? (r.group_avatar ?? null) : (r.other_avatar_url ?? null);
        const pid = isGroup ? r.conv_public_id : r.other_public_id;
        convs.set(r.conversation_id, { title, icon, pid: pid ?? null });
        if (pid) pidMap.set(pid, r.conversation_id);
      });
      convsRef.current = convs;
      pidToConvRef.current = pidMap;
      activeConvRef.current = activePublicId ? pidMap.get(activePublicId) ?? null : null;
    }

    loadConvs();

    const msgCh = sb
      .channel(`msg-notify-${rnd}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, async (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = payload.new as any;
        const me = myIdRef.current;
        if (!me || raw.sender_id === me) return;
        if (raw.type && raw.type === 'system') return;

        const convId = raw.conversation_id as string;
        let info = convsRef.current.get(convId);
        if (!info) {
          await loadConvs(true);
          info = convsRef.current.get(convId);
        }
        if (!info) return; // not one of my conversations

        // Broadcast a reliable "new DM" signal for the unread consumers (DM list
        // + icon-rail badges). Their OWN realtime channels can silently fail to
        // subscribe when the page opens many channels at once (typing channels
        // are one-per-conversation), which left the badge/highlight dark even
        // though this notifier channel (hence the sound) worked. Listening here
        // decouples the badge from those per-hook subscriptions. Fire regardless
        // of DnD/focus — DnD only silences sound/toast, not unread state; the
        // consumers skip the conversation you're actively viewing themselves.
        window.dispatchEvent(new CustomEvent('prosto:dm-message', {
          detail: { conversationId: convId, messageId: raw.id, fromMe: false },
        }));

        // Skip the chat you're actively looking at.
        if (convId === activeConvRef.current && typeof document !== 'undefined' && document.hasFocus()) return;

        // Do Not Disturb → no sound, no toast.
        if (statusRef.current === 'dnd') return;

        playSound('dm');

        const content = typeof raw.content === 'string' ? raw.content : '';
        const isSticker = content.startsWith('sticker:');
        const body = isSticker
          ? tm('sticker')
          : (!content || isUrl(content) ? tm('attachment') : content.slice(0, 140));
        if (prefs.toasts_enabled) showToast(info.title, body, info.icon, info.pid ? `/messages/${info.pid}` : null);
      })
      .subscribe();

    // Lazy, cached channel lookup for toast titles (#channel) + jump link.
    // Realtime only delivers channel_messages for channels the user can read
    // (RLS), so this is scoped to their own servers.
    const channelInfos = new Map<string, { title: string; base: string | null; serverId: string | null }>();
    async function channelInfo(channelId: string): Promise<{ title: string; base: string | null; serverId: string | null }> {
      const cached = channelInfos.get(channelId);
      if (cached) return cached;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any)
        .from('server_channels')
        .select('name, public_id, server_id, server:servers!server_channels_server_id_fkey(public_id)')
        .eq('id', channelId)
        .maybeSingle();
      const srv = data?.server ? (Array.isArray(data.server) ? data.server[0] : data.server) : null;
      const info = {
        title: data?.name ? `#${data.name}` : tm('newMessage'),
        base: srv?.public_id && data?.public_id ? `/s/${srv.public_id}/${data.public_id}` : null,
        serverId: (data?.server_id as string) ?? null,
      };
      channelInfos.set(channelId, info);
      return info;
    }

    // My per-server notify settings (level + mute), refreshed with conversations.
    const notifyByServer = new Map<string, { level: string; mutedUntil: number | null }>();
    async function loadNotify() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_my_server_notify');
      if (!Array.isArray(data)) return;
      notifyByServer.clear();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.forEach((r: any) => notifyByServer.set(r.server_id, {
        level: r.level ?? 'all',
        mutedUntil: r.muted_until ? new Date(r.muted_until).getTime() : null,
      }));
    }
    void loadNotify();

    // Global notification prefs (sound per surface + toasts) — refresh with
    // the conversation list. playSound()/showToast() read the module-level
    // `prefs` these populate.
    async function loadGlobalPrefs() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_notify_prefs');
      const row = Array.isArray(data) ? data[0] : data;
      if (row) prefs = {
        sound_enabled:  row.sound_enabled  ?? true,
        dm_sound:       row.dm_sound       ?? true,
        server_sound:   row.server_sound   ?? true,
        mention_sound:  row.mention_sound  ?? true,
        friend_sound:   row.friend_sound   ?? true,
        toasts_enabled: row.toasts_enabled ?? true,
      };
    }
    void loadGlobalPrefs();

    // Server channels: ring + toast for every incoming message (normal AND
    // pings), like DMs. Skipped for the channel you're actively viewing and in
    // Do Not Disturb; pings always ring even while viewing the channel.
    const chanCh = sb
      .channel(`chan-notify-${rnd}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' }, async (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = payload.new as any;
        const me = myIdRef.current;
        if (!me || raw.sender_id === me) return;
        if (statusRef.current === 'dnd') return;

        const content = typeof raw.content === 'string' ? raw.content : '';
        const uname = myUsernameRef.current;
        const pingsMe = /@(everyone|here)([^a-z0-9_]|$)/i.test(content)
          || (!!uname && new RegExp(`@${uname}([^a-z0-9_]|$)`, 'i').test(content));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeCh = (window as any).__prostoActiveChannelId;
        const viewing = raw.channel_id === activeCh && typeof document !== 'undefined' && document.hasFocus();

        const isSticker = content.startsWith('sticker:');
        const body = isSticker ? tm('sticker') : (!content || isUrl(content) ? tm('attachment') : content.slice(0, 140));

        const info = await channelInfo(raw.channel_id);
        // Honour per-server notify settings: muted or level='nothing' → silent;
        // level='mentions' → only pings ring/toast (matches the DB filter that
        // governs which mentions even create a notification).
        const ns = info.serverId ? notifyByServer.get(info.serverId) : undefined;
        const muted = !!ns?.mutedUntil && ns.mutedUntil > Date.now();
        const level = ns?.level ?? 'all';
        if (muted || level === 'nothing') return;

        if (pingsMe) {
          // Mentions always ring (even if you're looking at the channel).
          playSound('mention');
          if (!viewing && prefs.toasts_enabled) {
            const url = info.base ? `${info.base}?m=${raw.id}` : null;
            showToast(tm('mentionTitle'), body, null, url);
          }
          return;
        }

        // Plain message: only when level='all'. Ring + toast unless viewing it.
        if (level !== 'all' || viewing) return;
        playSound('server');
        if (!prefs.toasts_enabled) return;
        const url = info.base ? `${info.base}?m=${raw.id}` : null;
        showToast(info.title, body, null, url);
      })
      .subscribe();
    const profCh = sb
      .channel(`my-status-${rnd}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = payload.new as any;
        if (row?.id && row.id === myIdRef.current && typeof row.status === 'string') {
          statusRef.current = row.status;
        }
      })
      .subscribe();

    const poll = setInterval(() => { void loadConvs(true); }, 60000);

    return () => {
      active = false;
      sb.removeChannel(msgCh);
      sb.removeChannel(chanCh);
      sb.removeChannel(profCh);
      clearInterval(poll);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
