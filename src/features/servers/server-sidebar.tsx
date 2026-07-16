'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Hash, ChevronDown, Plus, UserPlus, Settings, FolderPlus, Settings2, Pencil, Trash2, Home, ShieldOff, Lock } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient, getBrowserUser } from '@/lib/supabase/client';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { useViewerAge } from '@/features/age';
import { ServerVerifiedBadge } from '@/components/ui';
import { CreateChannelModal, CreateCategoryModal, ManageTarget } from './moderation/manage-modals';
import { CreateInviteDialog } from './invites/create-invite-dialog';
import { ServerSettings } from './server-settings';
import { reorderChannels, reorderCategories, setChannelNsfw } from './actions';
import { PERM, hasPerm } from './roles/permissions';
import { setTabMeta } from '@/features/tabs';

const isGradient = (v: string | null | undefined): v is string => !!v && v.startsWith('linear-gradient');

interface ServerInfo { id: string; public_id: string; name: string; icon_url: string | null; banner_url: string | null; is_verified: boolean; vanity: string | null; description: string | null; tags: string[]; is_public: boolean; is_nsfw?: boolean; owner_id: string; is_owner: boolean; member_count: number; my_permissions?: number }
interface ChannelRow {
  channel_id: string; channel_public_id: string; name: string; type: string;
  category_id: string | null; category_name: string | null; pos: number; category_pos: number;
  synced_to_category?: boolean; is_nsfw?: boolean;
}
interface CategoryRow { id: string; name: string; pos: number }
interface Target { kind: 'channel' | 'category'; id: string; name: string; serverId: string; categoryId?: string | null; syncedToCategory?: boolean }
interface CtxMenu { target: Target; x: number; y: number }

const cache = new Map<string, { server: ServerInfo; channels: ChannelRow[]; categories: CategoryRow[] }>();

type ServerCacheEntry = { server: ServerInfo; channels: ChannelRow[]; categories: CategoryRow[] };
const ssKey = (pid: string) => `prosto:server-cache:${pid}`;

/** Read a cached server snapshot (memory first, then sessionStorage). */
function readCache(pid: string): ServerCacheEntry | undefined {
  const mem = cache.get(pid);
  if (mem) return mem;
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(ssKey(pid));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ServerCacheEntry;
    cache.set(pid, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

/** Persist a server snapshot so revisits and reloads render instantly. */
function writeCache(pid: string, entry: ServerCacheEntry): void {
  cache.set(pid, entry);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(ssKey(pid), JSON.stringify(entry));
  } catch {
    /* quota / serialization — non-fatal */
  }
}

/** Reinsert `dragId` into `targetCat` before `beforeId` (or at the end) and
 *  renumber positions per category. */
function reorder(channels: ChannelRow[], dragId: string, targetCat: string | null, beforeId: string | null): ChannelRow[] {
  const dragged = channels.find((c) => c.channel_id === dragId);
  if (!dragged) return channels;
  const rest = channels.filter((c) => c.channel_id !== dragId);
  const byCat = new Map<string, ChannelRow[]>();
  for (const c of rest) {
    const k = c.category_id ?? '';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(c);
  }
  const tk = targetCat ?? '';
  if (!byCat.has(tk)) byCat.set(tk, []);
  const moved = { ...dragged, category_id: targetCat };
  const arr = byCat.get(tk)!;
  const idx = beforeId ? arr.findIndex((c) => c.channel_id === beforeId) : -1;
  if (idx >= 0) arr.splice(idx, 0, moved); else arr.push(moved);
  const out: ChannelRow[] = [];
  for (const list of byCat.values()) list.forEach((c, i) => out.push({ ...c, pos: i }));
  return out;
}

export function ServerSidebar() {
  const t = useT('servers');
  const ta = useT('age');
  const { isAdult } = useViewerAge();
  const pathname = usePathname();
  const router = useRouter();
  const sbRef = useRef(createClient());

  const m = pathname.match(/^\/s\/([^/]+)(?:\/([^/]+))?/);
  const serverPid = m?.[1] ?? null;
  const activeChannelPid = m?.[2] ?? null;

  const seed = serverPid ? cache.get(serverPid) : undefined;
  const [server, setServer] = useState<ServerInfo | null>(seed?.server ?? null);
  const [channels, setChannels] = useState<ChannelRow[]>(seed?.channels ?? []);
  const [categories, setCategories] = useState<CategoryRow[]>(seed?.categories ?? []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0, width: 0 });
  const headerBtnRef = useRef<HTMLButtonElement>(null);
  const [modal, setModal] = useState<null | 'channel' | 'category' | 'invite' | 'settings'>(null);
  const [channelCat, setChannelCat] = useState<string | null>(null);
  const [manage, setManage] = useState<Target | null>(null);
  const [ctx, setCtx] = useState<CtxMenu | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // Channel drop indicator: which category + before which channel (null = end).
  const [drop, setDrop] = useState<{ catId: string | null; beforeId: string | null } | null>(null);
  // Category drag + its drop indicator (insert before beforeId, null = end).
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [catDrop, setCatDrop] = useState<{ beforeId: string | null } | null>(null);
  const scrollHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unread, setUnread] = useState<Record<string, { count: number; pings: number }>>({});
  const meRef = useRef<{ id: string; username: string } | null>(null);
  const channelIdsRef = useRef<Set<string>>(new Set());
  const activeChannelIdRef = useRef<string | null>(null);
  // Channels just read (open/left) — suppressed so a racing get_channel_unreads
  // poll can't flash the unread highlight back on before mark_channel_read
  // commits. Cleared when a genuinely new message arrives in that channel.
  const justReadChannelsRef = useRef<Set<string>>(new Set());

  // Who am I — for ping detection in incoming channel messages.
  useEffect(() => {
    let active = true;
    const sb = sbRef.current;
    getBrowserUser().then(async (user) => {
      if (!active || !user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).from('profiles').select('username').eq('id', user.id).maybeSingle();
      meRef.current = { id: user.id, username: data?.username ?? '' };
    });
    return () => { active = false; };
  }, []);

  // Keep the channel-id set + active channel id current; clear unread on open.
  useEffect(() => {
    channelIdsRef.current = new Set(channels.map((c) => c.channel_id));
    const activeId = channels.find((c) => c.channel_public_id === activeChannelPid)?.channel_id ?? null;
    activeChannelIdRef.current = activeId;
    if (activeId) {
      justReadChannelsRef.current.add(activeId);
      setUnread((prev) => { if (!prev[activeId]) return prev; const n = { ...prev }; delete n[activeId]; return n; });
    }
  }, [channels, activeChannelPid]);

  // Surface this server's total mention count on its browser tab (red badge).
  useEffect(() => {
    if (!serverPid) return;
    const totalPings = Object.values(unread).reduce((s, u) => s + (u?.pings ?? 0), 0);
    setTabMeta(`s:${serverPid}`, { ping: totalPings });
  }, [unread, serverPid]);

  // Latest values as refs so the split reloaders can write a complete cache
  // snapshot without depending on (and refetching) each other.
  const serverRef = useRef<ServerInfo | null>(server);
  serverRef.current = server;
  const channelsDataRef = useRef<ChannelRow[]>(channels);
  channelsDataRef.current = channels;
  const categoriesDataRef = useRef<CategoryRow[]>(categories);
  categoriesDataRef.current = categories;

  // Refetch only the server row (name / icon / banner / permissions / member
  // count). Used for `servers` + `server_members` changes so a member joining
  // or a metadata edit doesn't needlessly re-pull the whole channel tree.
  const reloadMeta = useCallback(async (): Promise<ServerInfo | null> => {
    if (!serverPid) return null;
    const sb = sbRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: srv, error } = await (sb as any).rpc('get_server', { p_public_id: serverPid });
    if (error) return serverRef.current; // transient — keep what we have
    const info = Array.isArray(srv) ? srv[0] : srv;
    if (!info) { router.push(site.routes.feed); return null; }
    setTabMeta(`s:${serverPid}`, { title: info.name, icon: info.icon_url ?? null, refId: info.id });
    serverRef.current = info;
    setServer(info);
    writeCache(serverPid, { server: info, channels: channelsDataRef.current, categories: categoriesDataRef.current });
    return info;
  }, [serverPid, router]);

  // Refetch only the channel + category tree. Used for `server_channels` /
  // `server_categories` changes (create / delete / reorder) — no server-row RPC.
  const reloadStructure = useCallback(async () => {
    const info = serverRef.current;
    if (!serverPid || !info?.id) return;
    const sb = sbRef.current;
    const [chRes, catRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('get_server_channels', { p_server: info.id }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('get_server_categories', { p_server: info.id }),
    ]);
    const { data: chs, error: e2 } = chRes;
    const { data: cats, error: e3 } = catRes;
    const nextChannels = (!e2 && Array.isArray(chs)) ? (chs as ChannelRow[]) : channelsDataRef.current;
    const nextCategories = (!e3 && Array.isArray(cats)) ? (cats as CategoryRow[]) : categoriesDataRef.current;
    channelsDataRef.current = nextChannels;
    categoriesDataRef.current = nextCategories;
    setChannels(nextChannels);
    setCategories(nextCategories);
    writeCache(serverPid, { server: info, channels: nextChannels, categories: nextCategories });
  }, [serverPid]);

  // Full refresh: metadata first (so structure has the server id), then the
  // tree. Used on navigation + the `server:changed` event.
  const reload = useCallback(async () => {
    const info = await reloadMeta();
    if (info) await reloadStructure();
  }, [reloadMeta, reloadStructure]);

  useEffect(() => {
    const cached = serverPid ? readCache(serverPid) : undefined;
    if (cached) {
      setServer(cached.server);
      setChannels(cached.channels);
      setCategories(cached.categories);
    } else {
      // No snapshot for this server yet — show the skeleton instead of the
      // previously open server's channels while we fetch.
      setServer(null);
      setChannels([]);
      setCategories([]);
    }
    reload();
    const onChanged = () => reload();
    window.addEventListener('server:changed', onChanged);
    return () => window.removeEventListener('server:changed', onChanged);
  }, [serverPid, reload]);

  // Seed per-channel unread/ping from persistent read state (survives reloads)
  // and refresh it when a channel is marked read or on a periodic catch-up.
  useEffect(() => {
    const id = server?.id;
    if (!id) return;
    const sb = sbRef.current;
    let active = true;
    async function loadChannelUnreads() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_channel_unreads');
      if (!active || !Array.isArray(data)) return;
      const ids = channelIdsRef.current;
      const next: Record<string, { count: number; pings: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.forEach((r: any) => {
        const chId = r.channel_id as string;
        if (!ids.has(chId)) return;                         // another server's channel
        if (chId === activeChannelIdRef.current) return;    // open channel stays clear
        if (justReadChannelsRef.current.has(chId)) return;  // just read — don't flash back
        const count = Number(r.unread_count) || 0;
        const pings = Number(r.mention_count) || 0;
        if (count > 0 || pings > 0) next[chId] = { count: Math.max(count, pings), pings };
      });
      setUnread(next);
    }
    loadChannelUnreads();
    const onChannelRead = () => loadChannelUnreads();
    window.addEventListener('prosto:channel-read', onChannelRead);
    // Debounced refresh when a new message arrives (authoritative ping counts).
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onRefresh = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(loadChannelUnreads, 400); };
    window.addEventListener('prosto:channel-unreads-refresh', onRefresh);
    const poll = setInterval(loadChannelUnreads, 60000);
    return () => {
      active = false;
      window.removeEventListener('prosto:channel-read', onChannelRead);
      window.removeEventListener('prosto:channel-unreads-refresh', onRefresh);
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id, channels.length]);

  useEffect(() => {
    const id = server?.id;
    if (!id) return;
    const sb = sbRef.current;
    const ch = sb
      .channel(`server-struct:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_channels', filter: `server_id=eq.${id}` }, () => reloadStructure())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_categories', filter: `server_id=eq.${id}` }, () => reloadStructure())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers', filter: `id=eq.${id}` }, () => reloadMeta())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: `server_id=eq.${id}` }, () => reloadMeta())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = payload.new as any;
        const chId = row?.channel_id as string | undefined;
        if (!chId || !channelIdsRef.current.has(chId)) return;
        if (chId === activeChannelIdRef.current) return;
        if (meRef.current && row.sender_id === meRef.current.id) return;
        justReadChannelsRef.current.delete(chId);           // genuinely new → un-suppress
        // Optimistic plain-unread only. Whether it pings ME is settings-gated
        // (level / mute / suppress) and known only to the DB, so the ping count
        // comes from the authoritative get_channel_unreads refresh below — never
        // from a client-side regex (that mis-counted on muted / pings-off servers).
        setUnread((prev) => {
          const cur = prev[chId] ?? { count: 0, pings: 0 };
          return { ...prev, [chId]: { count: cur.count + 1, pings: cur.pings } };
        });
        window.dispatchEvent(new CustomEvent('prosto:channel-unreads-refresh'));
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [server?.id, reloadMeta, reloadStructure]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('click', close); document.removeEventListener('scroll', close, true); };
  }, [menuOpen]);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('click', close); document.removeEventListener('scroll', close, true); };
  }, [ctx]);

  const persistOrder = useCallback((next: ChannelRow[]) => {
    if (!server) return;
    setChannels(next);
    if (serverPid) writeCache(serverPid, { server, channels: next, categories });
    reorderChannels(server.id, next.map((c) => ({ id: c.channel_id, category_id: c.category_id, position: c.pos })));
  }, [server, serverPid, categories]);

  // ── Channel drag: track the insertion point so we can draw the drop line ──
  function onChannelDragOver(e: React.DragEvent, ch: ChannelRow, groupChannels: ChannelRow[]) {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    if (!after) {
      setDrop({ catId: ch.category_id, beforeId: ch.channel_id });
    } else {
      const idx = groupChannels.findIndex((c) => c.channel_id === ch.channel_id);
      const next = groupChannels[idx + 1];
      setDrop({ catId: ch.category_id, beforeId: next ? next.channel_id : null });
    }
  }

  function commitDrop() {
    if (dragId && drop && drop.beforeId !== dragId) {
      persistOrder(reorder(channels, dragId, drop.catId, drop.beforeId));
    }
    setDragId(null);
    setDrop(null);
  }

  // ── Category drag: reorder categories, with the same insertion line ──
  const persistCategoryOrder = useCallback((next: CategoryRow[]) => {
    if (!server) return;
    setCategories(next);
    if (serverPid) writeCache(serverPid, { server, channels, categories: next });
    reorderCategories(server.id, next.map((c) => ({ id: c.id, position: c.pos })));
  }, [server, serverPid, channels]);

  function onCatDragOver(e: React.DragEvent, catId: string) {
    if (!dragCatId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    if (!after) {
      setCatDrop({ beforeId: catId });
    } else {
      const idx = categories.findIndex((c) => c.id === catId);
      const next = categories[idx + 1];
      setCatDrop({ beforeId: next ? next.id : null });
    }
  }

  function commitCatDrop() {
    const dragCat = dragCatId;
    const target = catDrop;
    setDragCatId(null);
    setCatDrop(null);
    if (!dragCat || !target || target.beforeId === dragCat) return;
    const ids = categories.map((c) => c.id);
    const from = ids.indexOf(dragCat);
    if (from < 0) return;
    ids.splice(from, 1);
    const insertAt = target.beforeId ? ids.indexOf(target.beforeId) : ids.length;
    ids.splice(insertAt < 0 ? ids.length : insertAt, 0, dragCat);
    if (ids.join('|') === categories.map((c) => c.id).join('|')) return;
    const posById = new Map(ids.map((id, i) => [id, i]));
    const next = [...categories]
      .map((c) => ({ ...c, pos: posById.get(c.id) ?? c.pos }))
      .sort((a, b) => a.pos - b.pos);
    persistCategoryOrder(next);
  }

  if (!server) {
    return (
      <div className="flex h-full flex-col">
        {/* Match the bannerless header height (not the tall banner) so the
            channel list doesn't jump down when a server without a banner loads. */}
        <div className="flex h-[52px] shrink-0 items-center border-b border-border/20 px-4">
          <div className="h-4 w-32 animate-skeleton rounded" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 px-3 py-4">
          <div className="mb-1 h-3 w-20 animate-skeleton rounded" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 w-full animate-skeleton rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // 18+ server the viewer isn't old enough for → keep them here but "close" the
  // server: no banner, no channel list, just a lock notice.
  if (server.is_nsfw && !isAdult) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-border/20 px-4">
          {server.is_verified && <ServerVerifiedBadge size="sm" />}
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{server.name}</span>
          <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">18+</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-[14px] font-semibold text-foreground">{ta('restrictedTitle')}</p>
          <p className="text-[12px] text-muted-foreground">{ta('restrictedBody')}</p>
        </div>
      </div>
    );
  }

  const isOwner = server.is_owner;
  const perms = Number(server.my_permissions) || 0;
  const canManageChannels = isOwner || hasPerm(perms, PERM.MANAGE_CHANNELS);
  const canInvite = isOwner || hasPerm(perms, PERM.CREATE_INVITE);

  const groups: { id: string | null; name: string | null; channels: ChannelRow[] }[] = [];
  const uncategorized = channels.filter((c) => !c.category_id).sort((a, b) => a.pos - b.pos);
  if (uncategorized.length) groups.push({ id: null, name: null, channels: uncategorized });
  for (const cat of categories) {
    groups.push({ id: cat.id, name: cat.name, channels: channels.filter((c) => c.category_id === cat.id).sort((a, b) => a.pos - b.pos) });
  }

  function openCtx(e: React.MouseEvent, target: Target) {
    e.preventDefault();
    setCtx({ target, x: e.clientX, y: e.clientY });
  }

  function onChannelsScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    el.classList.add('is-scrolling');
    if (scrollHideRef.current) clearTimeout(scrollHideRef.current);
    scrollHideRef.current = setTimeout(() => el.classList.remove('is-scrolling'), 900);
  }

  function toggleMenu() {
    if (menuOpen) { setMenuOpen(false); return; }
    const r = headerBtnRef.current?.getBoundingClientRect();
    if (r) setMenuCoords({ top: r.top + 52, left: r.left + 8, width: r.width - 16 });
    setMenuOpen(true);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="relative shrink-0 border-b border-border/20">
        <button
          ref={headerBtnRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleMenu(); }}
          className={cn(
            'relative flex w-full overflow-hidden text-left transition-colors',
            server.banner_url ? 'h-28 items-start hover:brightness-110' : 'items-center hover:bg-accent/40',
          )}
        >
          {server.banner_url && (
            <>
              {isGradient(server.banner_url) ? (
                <span className="absolute inset-0" style={{ backgroundImage: server.banner_url }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={server.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <span className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/25 to-transparent" />
            </>
          )}
          <span className={cn('relative flex w-full items-center gap-2 px-4 py-3.5', server.banner_url && 'text-white')}>
            {server.is_verified && <ServerVerifiedBadge size="sm" />}
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{server.name}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', server.banner_url ? 'text-white/80' : 'text-muted-foreground', menuOpen && 'rotate-180')} />
          </span>
        </button>
      </div>

      {/* Header dropdown — portal to body so it sits above the channel list. */}
      {menuOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="surface-solid fixed z-[9999] overflow-hidden rounded-xl p-1.5 shadow-2xl ring-1 ring-border/40"
          style={{ top: menuCoords.top, left: menuCoords.left, width: menuCoords.width }}
          onClick={(e) => e.stopPropagation()}
        >
          {canInvite && <MenuItem icon={UserPlus} label={t('invite')} onClick={() => { setMenuOpen(false); setModal('invite'); }} />}
          <MenuItem icon={Settings} label={t('settings')} onClick={() => { setMenuOpen(false); setModal('settings'); }} />
          {canManageChannels && <>
            <MenuItem icon={Plus} label={t('createChannel')} onClick={() => { setMenuOpen(false); setChannelCat(null); setModal('channel'); }} />
            <MenuItem icon={FolderPlus} label={t('createCategory')} onClick={() => { setMenuOpen(false); setModal('category'); }} />
          </>}
        </div>,
        document.body,
      )}

      {/* Channels — the container is the "uncategorized" drop target. */}
      <div
        className="scrollbar-auto-hide relative z-0 flex-1 overflow-y-auto px-2 py-3"
        onScroll={onChannelsScroll}
        onDragOver={canManageChannels ? (e) => { if (dragId) { e.preventDefault(); setDrop({ catId: null, beforeId: null }); } } : undefined}
        onDrop={canManageChannels ? () => commitDrop() : undefined}
      >
        {/* Server Home */}
        <Link
          href={`${site.routes.server(server.public_id)}/home`}
          className={cn(
            'mb-2 flex items-center gap-2 rounded-lg px-2 py-2 text-[15px] font-medium transition-colors md:py-1.5',
            activeChannelPid === 'home' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
          )}
        >
          <Home className="h-[18px] w-[18px] shrink-0" />
          <span className="truncate">{t('serverHome')}</span>
        </Link>

        {groups.map((g) => (
          <div
            key={g.id ?? 'none'}
            className="mb-3"
            onDragOver={canManageChannels ? (e) => { if (dragId) { e.preventDefault(); e.stopPropagation(); setDrop({ catId: g.id, beforeId: null }); } } : undefined}
            onDrop={canManageChannels ? (e) => { if (dragId) { e.stopPropagation(); commitDrop(); } } : undefined}
          >
            {/* Category insertion line — shown while dragging a category. */}
            {dragCatId && g.id && catDrop?.beforeId === g.id && (
              <div className="mx-2 mb-1 h-0.5 rounded-full bg-link" />
            )}
            {g.name && (
              <div
                className={cn(
                  'group flex items-center justify-between px-2 pb-1',
                  canManageChannels && g.id && 'cursor-grab active:cursor-grabbing',
                  dragCatId === g.id && 'opacity-40',
                )}
                draggable={canManageChannels && !!g.id}
                onDragStart={canManageChannels && g.id ? (e) => { e.stopPropagation(); setDragCatId(g.id!); } : undefined}
                onDragEnd={canManageChannels && g.id ? () => { setDragCatId(null); setCatDrop(null); } : undefined}
                onDragOver={canManageChannels && g.id ? (e) => { if (dragCatId) onCatDragOver(e, g.id!); } : undefined}
                onDrop={canManageChannels && g.id ? (e) => { if (dragCatId) { e.preventDefault(); e.stopPropagation(); commitCatDrop(); } } : undefined}
                onContextMenu={canManageChannels && g.id ? (e) => openCtx(e, { kind: 'category', id: g.id!, name: g.name ?? '', serverId: server.id }) : undefined}
              >
                <p className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-muted-foreground/50">{g.name}</p>
                {canManageChannels && g.id && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title={t('editCategory')}
                      onClick={() => setManage({ kind: 'category', id: g.id!, name: g.name ?? '', serverId: server.id })}
                      className="touch-reveal flex h-7 w-7 items-center justify-center text-muted-foreground/40 opacity-0 transition-colors hover:text-foreground group-hover:opacity-100"
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={t('createChannel')}
                      onClick={() => { setChannelCat(g.id); setModal('channel'); }}
                      className="text-muted-foreground/50 transition-colors hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
            {g.channels.map((ch) => {
              const active = ch.channel_public_id === activeChannelPid;
              const u = unread[ch.channel_id];
              const isUnread = !active && !!u && u.count > 0;
              const pings = !active ? (u?.pings ?? 0) : 0;
              return (
                <div
                  key={ch.channel_id}
                  className={cn('group/ch relative flex items-center', dragId === ch.channel_id && 'opacity-40')}
                  draggable={canManageChannels}
                  onDragStart={canManageChannels ? () => setDragId(ch.channel_id) : undefined}
                  onDragEnd={canManageChannels ? () => { setDragId(null); setDrop(null); } : undefined}
                  onDragOver={canManageChannels ? (e) => onChannelDragOver(e, ch, g.channels) : undefined}
                  onDrop={canManageChannels ? (e) => { if (dragId) { e.stopPropagation(); commitDrop(); } } : undefined}
                  onContextMenu={canManageChannels ? (e) => openCtx(e, { kind: 'channel', id: ch.channel_id, name: ch.name, serverId: server.id, categoryId: ch.category_id, syncedToCategory: ch.synced_to_category }) : undefined}
                >
                  {/* Channel insertion line — shown while dragging a channel. */}
                  {dragId && dragId !== ch.channel_id && drop?.beforeId === ch.channel_id && (
                    <span className="pointer-events-none absolute inset-x-1 -top-[3px] z-10 h-0.5 rounded-full bg-link" />
                  )}
                  {isUnread && pings === 0 && <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-foreground" />}
                  <Link
                    href={site.routes.serverChannel(server.public_id, ch.channel_public_id)}
                    // Warm the channel route (RSC + messages) on hover/focus so
                    // the click opens instantly with no skeleton (Discord-style).
                    // Default Link prefetch only fetches the loading state for
                    // dynamic routes; router.prefetch pulls the data too. Next
                    // dedupes within its cache window, so repeated hovers are cheap.
                    onPointerEnter={() => router.prefetch(site.routes.serverChannel(server.public_id, ch.channel_public_id))}
                    onFocus={() => router.prefetch(site.routes.serverChannel(server.public_id, ch.channel_public_id))}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-2 text-[15px] transition-colors md:py-1.5',
                      active ? 'bg-accent text-foreground'
                        : isUnread ? 'font-semibold text-foreground hover:bg-accent/40'
                        : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                    )}
                  >
                    <Hash className="h-[18px] w-[18px] shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{ch.name}</span>
                    {ch.is_nsfw && (
                      <span className="shrink-0 rounded bg-destructive/15 px-1 py-0.5 text-[9px] font-bold leading-none text-destructive">18+</span>
                    )}
                    {pings > 0 && (
                      <span className="ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-white">{pings}</span>
                    )}
                  </Link>
                  {canManageChannels && (
                    <button
                      type="button"
                      title={t('editChannel')}
                      onClick={() => setManage({ kind: 'channel', id: ch.channel_id, name: ch.name, serverId: server.id, categoryId: ch.category_id, syncedToCategory: ch.synced_to_category })}
                      className="touch-reveal absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-card text-muted-foreground/50 opacity-0 transition-colors hover:text-foreground group-hover/ch:opacity-100"
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {/* End-of-group channel insertion line. */}
            {dragId && drop?.catId === g.id && drop?.beforeId === null && (
              <div className="mx-2 mt-0.5 h-0.5 rounded-full bg-link" />
            )}
          </div>
        ))}
        {/* Category insertion line at the very end (after the last category). */}
        {dragCatId && catDrop?.beforeId === null && (
          <div className="mx-2 h-0.5 rounded-full bg-link" />
        )}
      </div>

      {/* Right-click context menu — portalled to body so it escapes the
          sidebar's backdrop-filter (which otherwise breaks position:fixed) and
          clamped to the viewport so it never runs off-screen. */}
      {ctx && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] min-w-[150px] overflow-hidden rounded-lg bg-card p-1 shadow-2xl ring-1 ring-border/40 animate-pop-in"
          style={{
            top: Math.min(ctx.y, window.innerHeight - 110),
            left: Math.min(ctx.x, window.innerWidth - 170),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CtxItem icon={Pencil} label={t('edit')} onClick={() => { setManage(ctx.target); setCtx(null); }} />
          {ctx.target.kind === 'channel' && (() => {
            const chId = ctx.target.id;
            const cur = channels.find((c) => c.channel_id === chId)?.is_nsfw ?? false;
            return (
              <CtxItem
                icon={ShieldOff}
                label={ta('markNsfw')}
                onClick={() => {
                  setChannels((prev) => prev.map((c) => (c.channel_id === chId ? { ...c, is_nsfw: !cur } : c)));
                  void setChannelNsfw(chId, !cur);
                  setCtx(null);
                }}
              />
            );
          })()}
          <CtxItem icon={Trash2} destructive label={t('delete')} onClick={() => { setManage(ctx.target); setCtx(null); }} />
        </div>,
        document.body,
      )}

      {modal === 'channel' && <CreateChannelModal serverId={server.id} categoryId={channelCat} onClose={() => setModal(null)} />}
      {modal === 'category' && <CreateCategoryModal serverId={server.id} onClose={() => setModal(null)} />}
      {modal === 'invite' && <CreateInviteDialog serverId={server.id} onClose={() => setModal(null)} onCreated={() => {}} />}
      {modal === 'settings' && <ServerSettings serverId={server.id} currentName={server.name} currentIcon={server.icon_url} currentBanner={server.banner_url} currentVanity={server.vanity} currentDescription={server.description} currentTags={server.tags} currentIsPublic={server.is_public} currentIsNsfw={server.is_nsfw ?? false} isVerified={server.is_verified} isOwner={isOwner} myPermissions={server.my_permissions} onClose={() => setModal(null)} />}
      {manage && <ManageTarget target={manage} onClose={() => setManage(null)} />}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof Hash; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-[14px] font-medium text-foreground transition-colors hover:bg-accent">
      {label}
      <Icon className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function CtxItem({ icon: Icon, label, onClick, destructive }: { icon: typeof Hash; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
        destructive ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
