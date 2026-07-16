'use client';

import { createClient } from '@/lib/supabase/client';

export interface ServerEmoji { id: string; public_id: string; name: string; url: string; is_animated: boolean }
export interface EmojiServer { id: string; public_id: string; name: string; icon_url: string | null; member_count: number; online_count: number }
export interface ServerEmojiGroup { server: EmojiServer; emojis: ServerEmoji[] }

// Module-level cache so the emoji picker shows a server's emojis instantly
// (they're prefetched when you enter the platform, Discord-style). Server
// emojis are usable everywhere, so we also keep a registry of the user's
// servers to group them in the picker with their avatars.
const cache = new Map<string, ServerEmoji[]>();
const servers = new Map<string, EmojiServer>();
// id → emoji registry, so `<:name:id>` / `<a:name:id>` tokens resolve to an
// image anywhere (chat, bio, nicknames). Keyed by the short public_id (what the
// token carries) and also by the uuid for safety. Populated whenever emojis are
// cached, and topped up on demand via `fetchEmojiById` for emojis from servers
// the viewer isn't in.
const emojiById = new Map<string, ServerEmoji>();
// ids we've already tried to fetch (found or not) to avoid hammering the RPC.
const fetchedIds = new Set<string>();

// ── Reactivity: a monotonically-increasing version bumped whenever the registry
// gains emojis. Renderers (CustomEmoji, ReactionBar) subscribe via
// useSyncExternalStore so a token that couldn't resolve yet re-resolves the
// instant its server's emojis finish loading — no manual re-render, no stale
// `:name:` fallback lingering in nicknames / members lists.
let emojiVersion = 0;
const versionListeners = new Set<() => void>();

function bumpEmojiVersion(): void {
  emojiVersion++;
  versionListeners.forEach((l) => l());
}

/** Subscribe to registry updates (for useSyncExternalStore). */
export function subscribeEmojis(cb: () => void): () => void {
  versionListeners.add(cb);
  return () => versionListeners.delete(cb);
}

/** Current registry version — changes whenever emojis are added. */
export function getEmojiVersion(): number {
  return emojiVersion;
}

function indexById(list: ServerEmoji[]): void {
  if (list.length === 0) return;
  list.forEach((e) => {
    if (e.public_id) emojiById.set(e.public_id, e);
    emojiById.set(e.id, e);
  });
  bumpEmojiVersion();
}

/** Register the user's servers (id/name/icon/public_id) so the picker can group emojis. */
export function registerEmojiServers(list: { id: string; public_id: string; name: string; icon_url?: string | null; member_count?: number; online_count?: number }[]): void {
  list.forEach((s) => servers.set(s.id, { id: s.id, public_id: s.public_id, name: s.name, icon_url: s.icon_url ?? null, member_count: s.member_count ?? 0, online_count: s.online_count ?? 0 }));
}

/** Cached emojis for a server (undefined until first load). */
export function getCachedServerEmojis(serverId?: string | null): ServerEmoji[] | undefined {
  return serverId ? cache.get(serverId) : undefined;
}

/** Overwrite the cached emoji list for a server. Called by the server emoji
 *  manager after add/rename/delete so the picker reflects changes everywhere
 *  immediately (without needing to open that server's emoji tab first). */
export function setCachedServerEmojis(serverId: string, list: ServerEmoji[]): void {
  cache.set(serverId, list);
  indexById(list);
}

/** Sync lookup of a cached emoji by its id — accepts the short public_id (what
 *  tokens carry) or the uuid. Undefined if not yet loaded. */
export function getEmojiById(id: string): ServerEmoji | undefined {
  return emojiById.get(id);
}

/** Sync lookup of a cached emoji by name (case-insensitive) across every loaded
 *  server. Used as a fallback so a token like `<a:cat:ID>` still renders from a
 *  server the viewer *is* in even when the id can't be resolved (e.g. the
 *  `get_emoji_by_public_id` RPC / public_id column isn't available yet). */
export function getEmojiByName(name: string): ServerEmoji | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  for (const emojis of cache.values()) {
    const hit = emojis.find((e) => e.name.toLowerCase() === lower);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Resolve an emoji by its short public id, hitting the `get_emoji_by_public_id`
 * RPC when it isn't cached (e.g. an emoji from a server the viewer isn't in).
 * Caches both hits and misses so repeated renders don't re-query. Non-numeric
 * ids (legacy uuid tokens) are only served from cache. Undefined if unknown.
 */
export async function fetchEmojiById(id: string): Promise<ServerEmoji | undefined> {
  const cached = emojiById.get(id);
  if (cached) return cached;
  if (fetchedIds.has(id)) return undefined;
  fetchedIds.add(id);
  // Short public ids are numeric; anything else can't be looked up remotely.
  if (!/^\d+$/.test(id)) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createClient() as any).rpc('get_emoji_by_public_id', { p_id: id });
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.url) {
      const emoji: ServerEmoji = { id: row.id, public_id: String(row.public_id ?? id), name: row.name, url: row.url, is_animated: !!row.is_animated };
      if (emoji.public_id) emojiById.set(emoji.public_id, emoji);
      emojiById.set(emoji.id, emoji);
      bumpEmojiVersion();
      return emoji;
    }
  } catch { /* ignore — caller falls back to the `:name:` text */ }
  return undefined;
}

/**
 * Expand `:name:` shortcodes (what the picker inserts into the composer) into
 * full custom-emoji tokens — `<:name:id>` or `<a:name:id>` (Discord-style,
 * id-based) — using the cached server emojis. The composer stays clean, the
 * stored message carries a stable id, and every viewer resolves it back to an
 * image via the emoji registry. Names not found in the cache are left as-is.
 */
export function resolveEmojiShortcodes(text: string): string {
  if (!text.includes(':')) return text;
  // Match a full custom-emoji token OR a bare `:name:` shortcode. Full tokens
  // (what the picker inserts) are matched first and emitted verbatim, so we
  // never rewrite the `:name:` inside one — otherwise `<a:cat:id>` would become
  // `<a<:cat:id>id>`. Only bare shortcodes (typed/pasted) expand.
  const RE = /<a?:[a-z0-9_]{2,32}:[^\s>]+>|:([a-z0-9_]{2,32}):/gi;
  return text.replace(RE, (full: string, shortName?: string) => {
    if (shortName == null) return full; // it was already a full token
    const name = shortName.toLowerCase();
    for (const emojis of cache.values()) {
      const hit = emojis.find((e) => e.name.toLowerCase() === name);
      if (hit) return `<${hit.is_animated ? 'a' : ''}:${hit.name}:${hit.public_id || hit.id}>`;
    }
    return full;
  });
}

/** All servers (that we've loaded) which currently have emojis, grouped with
 *  their metadata. Used to make server emojis available everywhere. */
export function getAllServerEmojiGroups(): ServerEmojiGroup[] {
  const groups: ServerEmojiGroup[] = [];
  for (const [id, emojis] of cache) {
    if (!emojis.length) continue;
    const server = servers.get(id) ?? { id, public_id: '', name: 'Сервер', icon_url: null, member_count: 0, online_count: 0 };
    groups.push({ server, emojis });
  }
  return groups;
}

/** Find the server that owns a specific custom emoji URL. Returns undefined if
 *  the emoji belongs to an unknown server or the url is not a custom emoji. */
export function findServerByEmojiUrl(url: string): EmojiServer | undefined {
  for (const [serverId, emojis] of cache) {
    if (emojis.some((e) => e.url === url)) return servers.get(serverId);
  }
  return undefined;
}

/** Load emojis for every registered server that hasn't been cached yet.
 *  Called when the emoji picker opens so custom emojis are always visible,
 *  even if the background prefetch hasn't finished yet. */
export async function loadAllUncachedServerEmojis(): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const id of servers.keys()) {
    if (!cache.has(id)) pending.push(loadServerEmojis(id).catch(() => {}));
  }
  await Promise.all(pending);
}

// Guards a one-time self-registration of the user's servers (see below).
let selfRegistered = false;

/**
 * Guarantee the picker can show emojis from *every* server the user is in —
 * even when opened from a DM or the feed, or before the app-entry prefetch has
 * registered anything. If the server registry is still empty we fetch it
 * ourselves via `get_my_servers`, then load every server's emojis. This is what
 * makes custom emojis usable everywhere, from any of your servers.
 */
export async function ensureEmojiServersLoaded(): Promise<void> {
  if (servers.size === 0 && !selfRegistered) {
    selfRegistered = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (createClient() as any).rpc('get_my_servers');
      if (Array.isArray(data)) registerEmojiServers(data);
    } catch { /* offline / not signed in — nothing to register */ }
  }
  await loadAllUncachedServerEmojis();
}

/** Resolves when an image URL has loaded (or times out / errors). */
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload  = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
    // If the image is already in the browser cache it fires sync — still safe.
  });
}

/** Fetch + cache a server's emojis and wait for all images to land in the
 *  browser HTTP cache. Reuses the cache unless `force`. An 8-second timeout
 *  ensures a slow CDN never blocks the app indefinitely. */
export async function loadServerEmojis(serverId: string, force = false): Promise<ServerEmoji[]> {
  if (!force && cache.has(serverId)) return cache.get(serverId)!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createClient() as any).rpc('list_server_emojis', { p_server: serverId });
  const list: ServerEmoji[] = Array.isArray(data) ? data : [];
  cache.set(serverId, list);
  indexById(list);
  if (typeof window !== 'undefined' && list.length > 0) {
    const timeout = new Promise<void>((r) => setTimeout(r, 8000));
    await Promise.race([
      Promise.all(list.map((e) => preloadImage(e.url))),
      timeout,
    ]);
  }
  return list;
}
