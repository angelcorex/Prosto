'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Presence { status: string | null; last_seen: string | null; devices?: string[] }
interface Entry extends Presence { ts: number }

// ── Module-level singleton shared by all consumers ──
const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
let started = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bus: any = null;
// The broadcast bus is only usable for WebSocket delivery once the channel has
// actually joined. Sending before then makes supabase-js silently fall back to
// the REST endpoint (now deprecated + noisy). We track readiness and buffer the
// latest presence payload, flushing it the moment we're subscribed.
let busReady = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pendingBroadcast: any = null;

function broadcast(payload: { id: string; status: string | null; last_seen: string | null; ts: number }) {
  if (busReady && bus) {
    bus.send({ type: 'broadcast', event: 'status', payload });
  } else {
    // Not joined yet — keep only the most recent state; it's flushed on join.
    pendingBroadcast = payload;
  }
}

function notify() { listeners.forEach(l => l()); }

/**
 * Apply a status/last_seen update for a profile, ignoring anything older than
 * what we already have (events can arrive out of order).
 */
function applyRemote(id: string, status: string | null, lastSeen: string | null, ts: number) {
  const prev = store.get(id);
  if (prev && ts < prev.ts) return; // stale — keep the newer state
  if (prev && prev.status === status && prev.last_seen === lastSeen) {
    prev.ts = ts;
    return;
  }
  store.set(id, { status, last_seen: lastSeen ?? prev?.last_seen ?? null, devices: prev?.devices, ts });
  notify();
}

/**
 * Publish the current user's presence to everyone instantly via the broadcast
 * bus and update the local store. Pass `status` undefined to keep the current
 * status and just refresh last_seen (heartbeat).
 */
export function publishPresence(id: string, status?: string | null, lastSeen?: string | null) {
  if (!id) return;
  const prev = store.get(id);
  const finalStatus = status === undefined ? (prev?.status ?? 'online') : status;
  const ls = lastSeen ?? new Date().toISOString();
  const ts = Date.now();

  store.set(id, { status: finalStatus, last_seen: ls, devices: prev?.devices, ts });
  notify();

  ensureStarted();
  broadcast({ id, status: finalStatus, last_seen: ls, ts });
}

/** Mark a user connected (from realtime presence join/sync). */
export function markOnline(id: string) {
  if (!id) return;
  const prev = store.get(id);
  store.set(id, { status: prev?.status ?? 'online', last_seen: new Date().toISOString(), devices: prev?.devices, ts: Date.now() });
  notify();
}

/** Mark a user disconnected (all their tabs/app closed) → shows offline. */
export function markOffline(id: string) {
  if (!id) return;
  const prev = store.get(id);
  store.set(id, { status: prev?.status ?? null, last_seen: null, devices: prev?.devices, ts: Date.now() });
  notify();
}

/** Seed an initial (SSR) presence value without broadcasting; never clobbers live data. */
export function seedPresence(id: string, status: string | null, lastSeen: string | null) {
  if (!id || store.has(id)) return;
  store.set(id, { status: status ?? null, last_seen: lastSeen ?? null, ts: 0 });
}

/** Read the current presence for a profile id (live store value). */
export function getPresence(id: string): Presence | undefined {
  const e = store.get(id);
  return e ? { status: e.status, last_seen: e.last_seen, devices: e.devices ?? [] } : undefined;
}

// ── Active-device tracking (from the DB sessions table) ──
// Components mount a DeviceBadge which "watches" a user id; we poll the active
// device kinds for all watched ids together and refresh them periodically so
// AFK/backgrounded devices stay shown while their session is alive and drop
// once it goes stale. Robust to realtime flapping.
// Ref-counted so a badge unmounting stops watching its id. Without this the set
// only ever grew and the 30s poll kept enlarging its id list for the whole
// session (a slow memory + request leak). The poll runs only while something is
// actually being watched.
const watched = new Map<string, number>();
let deviceTimer: ReturnType<typeof setTimeout> | null = null;
let devicePoll: ReturnType<typeof setInterval> | null = null;

/**
 * Start watching a profile's active devices; returns an unwatch function to
 * call on unmount. Multiple watchers of the same id share one entry (ref count)
 * and the shared poll stops once the last watcher releases.
 */
export function ensureDevice(id: string | null | undefined): () => void {
  if (!id || typeof window === 'undefined') return () => {};

  const prevCount = watched.get(id) ?? 0;
  watched.set(id, prevCount + 1);
  if (prevCount === 0) {
    // Newly watched → fetch its devices soon (debounced across a burst of mounts).
    if (deviceTimer) clearTimeout(deviceTimer);
    deviceTimer = setTimeout(fetchDevices, 80);
  }
  if (!devicePoll) devicePoll = setInterval(fetchDevices, 30000);

  let released = false;
  return () => {
    if (released) return; // idempotent — safe under StrictMode double-invoke
    released = true;
    const count = watched.get(id) ?? 0;
    if (count <= 1) watched.delete(id);
    else watched.set(id, count - 1);
    if (watched.size === 0 && devicePoll) {
      clearInterval(devicePoll);
      devicePoll = null;
    }
  };
}

async function fetchDevices() {
  deviceTimer = null;
  const ids = [...watched.keys()];
  if (!ids.length) return;
  try {
    const sb = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).rpc('get_user_devices', { p_ids: ids });
    const byUser = new Map<string, Set<string>>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Array.isArray(data) ? data : []).forEach((r: any) => {
      if (!r?.user_id || !r?.device) return;
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
      byUser.get(r.user_id)!.add(r.device);
    });
    let changed = false;
    ids.forEach((id) => {
      const devs = [...(byUser.get(id) ?? [])];
      const prev = store.get(id);
      const prevDevs = prev?.devices ?? [];
      if (prevDevs.length === devs.length && prevDevs.every((d) => devs.includes(d))) return;
      store.set(id, { status: prev?.status ?? null, last_seen: prev?.last_seen ?? null, devices: devs, ts: prev?.ts ?? 0 });
      changed = true;
    });
    if (changed) notify();
  } catch {
    /* transient — retried on the next poll */
  }
}

/** Re-render the caller on any presence change — for lists that read getPresence. */
export function usePresenceTick() {
  const [, force] = useState(0);
  useEffect(() => {
    ensureStarted();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
}

function ensureStarted() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const sb = createClient();

  // Broadcast bus — instant presence sync across clients (like typing).
  bus = sb.channel('presence-bus', { config: { broadcast: { self: false } } });
  bus
    .on('broadcast', { event: 'status' }, ({ payload }: { payload: { id?: string; status?: string | null; last_seen?: string | null; ts?: number } }) => {
      if (!payload?.id) return;
      applyRemote(payload.id, payload.status ?? null, payload.last_seen ?? null, payload.ts ?? Date.now());
    })
    .subscribe((status: string) => {
      // Only send over the socket once joined; otherwise supabase-js falls back
      // to the (deprecated) REST path. Flush the last buffered payload on join.
      busReady = status === 'SUBSCRIBED';
      if (busReady && pendingBroadcast) {
        bus.send({ type: 'broadcast', event: 'status', payload: pendingBroadcast });
        pendingBroadcast = null;
      }
    });

  // Periodic re-render so time-based status (online → offline as last_seen
  // ages) stays correct everywhere even with no incoming events.
  setInterval(notify, 30000);
}

/**
 * Live presence (status + last_seen + active devices) for one profile id, kept
 * in sync across the whole app. Pass SSR values as the initial state to avoid
 * flicker.
 */
export function usePresence(
  id: string | null | undefined,
  initialStatus?: string | null,
  initialLastSeen?: string | null,
): Presence {
  const [, force] = useState(0);

  useEffect(() => {
    ensureStarted();
    if (id && !store.has(id) && (initialStatus !== undefined || initialLastSeen !== undefined)) {
      store.set(id, { status: initialStatus ?? null, last_seen: initialLastSeen ?? null, ts: 0 });
    }
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) return { status: initialStatus ?? null, last_seen: initialLastSeen ?? null, devices: [] };
  const e = store.get(id);
  return e ? { status: e.status, last_seen: e.last_seen, devices: e.devices ?? [] } : { status: initialStatus ?? null, last_seen: initialLastSeen ?? null, devices: [] };
}
