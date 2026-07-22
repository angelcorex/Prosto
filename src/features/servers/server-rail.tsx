'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Plus, Compass, Folder, FolderPlus, Pin, PinOff, Trash2, X, Copy, CheckCheck, Bell, AtSign, Users, BellOff, VolumeX } from 'lucide-react';
import { ServerVerifiedIcon } from '@/lib/icons';

import { cn } from '@/lib/utils/cn';
import { createClient, getBrowserUser } from '@/lib/supabase/client';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { Tooltip } from '@/components/ui';
import { CreateServerModal } from './discovery/create-server-modal';
import { ServerDiscovery } from './discovery/server-discovery';
import { loadServerEmojis, registerEmojiServers } from '@/lib/emoji';
import { setTabMeta } from '@/features/tabs';
import { toggleServerPin, reorderServers, createServerFolder, deleteServerFolder, markServerRead, setServerNotifySettings } from './actions';

interface ServerItem {
  id: string; public_id: string; name: string; icon_url: string | null;
  is_verified?: boolean; member_count?: number; online_count?: number;
  sort_pos?: number; pinned?: boolean; folder_id?: string | null;
}
interface FolderItem { id: string; name: string | null; color: string | null; position: number }

const EXPANDED_KEY = 'prosto:folders:expanded';

// Cache the rail (servers + folders) so a page reload paints the icons instantly
// from sessionStorage instead of popping them in after the network round-trip.
const RAIL_CACHE_KEY = 'prosto:rail-cache:v1';
type RailCache = { servers: ServerItem[]; folders: FolderItem[] };
function readRailCache(): RailCache | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(RAIL_CACHE_KEY);
    return raw ? (JSON.parse(raw) as RailCache) : undefined;
  } catch {
    return undefined;
  }
}
function writeRailCache(entry: RailCache): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(RAIL_CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota — non-fatal */
  }
}

export function ServerRail() {
  const t = useT('servers');
  const pathname = usePathname();
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  // Per-server unread: how many pings (mentions) + whether there's any plain
  // unread. Muted servers still count pings (red badge) but suppress plain
  // unread (no white dot) — Discord-style.
  const [unread, setUnread] = useState<Record<string, { pings: number; hasUnread: boolean }>>({});
  // server_id → active mute (muted_until in the future). Drives the dimmed
  // avatar and the "no plain-unread dot" behaviour.
  const [mutedServers, setMutedServers] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ server: ServerItem; x: number; y: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ folder: FolderItem; x: number; y: number } | null>(null);
  const [notifyFor, setNotifyFor] = useState<ServerItem | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]')); } catch { return new Set(); }
  });
  // Drag-to-reorder loose servers: the dragged id + insertion gap (index in
  // the loose list) the drop-line points at. `folderHover` is the folder
  // currently under the pointer while dragging (a drop target that swallows
  // the server into that folder).
  const [dragServerId, setDragServerId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [folderHover, setFolderHover] = useState<string | null>(null);
  const sbRef = useRef(createClient());
  const mapRef = useRef<Map<string, string>>(new Map());
  const meRef = useRef<{ id: string; username: string } | null>(null);

  const activePid = pathname.match(/^\/s\/([^/]+)/)?.[1] ?? null;

  useEffect(() => {
    if (!activePid) return;
    // Being on a server clears its PLAIN unread (you're looking at it), but NOT
    // its ping count — a mention in another channel must still show on the
    // avatar even while you're in the server (Discord-style). The open channel's
    // ChannelChat marks itself read, which reconciles the count via the poll.
    setUnread((prev) => {
      const cur = prev[activePid];
      if (!cur || !cur.hasUnread) return prev;
      return { ...prev, [activePid]: { ...cur, hasUnread: false } };
    });
  }, [activePid]);

  useEffect(() => {
    const sb = sbRef.current;
    let active = true;
    // Paint cached icons immediately on mount/reload; the network refresh below
    // reconciles them a moment later.
    const cachedRail = readRailCache();
    if (cachedRail) { setServers(cachedRail.servers); setFolders(cachedRail.folders); }
    async function loadServers() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_my_servers');
      if (active && Array.isArray(data)) {
        setServers(data);
        registerEmojiServers(data);
        // Prefetch every server's custom emojis immediately so they are in cache
        // before the user opens the emoji picker (Discord-style prefetch).
        data.forEach((s: ServerItem) => { loadServerEmojis(s.id).catch(() => {}); });
      }
    }
    async function loadFolders() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_my_server_folders');
      if (active && Array.isArray(data)) setFolders(data);
    }
    async function loadMap() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_my_channel_servers');
      if (active && Array.isArray(data)) {
        const map = new Map<string, string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((r: any) => map.set(r.channel_id, r.server_public_id));
        mapRef.current = map;
      }
    }
    async function loadMe() {
      const user = await getBrowserUser();
      if (!active || !user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).from('profiles').select('username').eq('id', user.id).maybeSingle();
      meRef.current = { id: user.id, username: data?.username ?? '' };
    }

    // Load my per-server notify settings (drives the muted set + dimmed avatar).
    // server_id (uuid) → muted? — we key the rail by public_id, so map via
    // the servers list (id → public_id) once both are loaded.
    const mutedIds = new Set<string>();      // server UUIDs currently muted
    let unreadRequestId = 0;
    async function loadNotifySettings() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_my_server_notify');
      if (!active || !Array.isArray(data)) return;
      mutedIds.clear();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.forEach((r: any) => {
        if (r.muted_until && new Date(r.muted_until).getTime() > Date.now()) mutedIds.add(r.server_id as string);
      });
      // Translate UUIDs → public_ids using the current server list.
      setServers((prev) => {
        setMutedServers(new Set(prev.filter((s) => mutedIds.has(s.id)).map((s) => s.public_id)));
        return prev;
      });
    }

    // Persistent unread/ping count per server, aggregated from per-channel read
    // state (survives reloads). Muted servers keep their ping count (red badge)
    // but suppress plain unread (no white dot).
    async function loadUnreads() {
      const requestId = ++unreadRequestId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_channel_unreads');
      if (!active || requestId !== unreadRequestId || !Array.isArray(data)) return;
      const agg: Record<string, { pings: number; hasUnread: boolean }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.forEach((r: any) => {
        const pid = r.server_public_id as string;
        if (!pid) return;
        const cur = agg[pid] ?? { pings: 0, hasUnread: false };
        cur.pings += Number(r.mention_count) || 0;
        if ((Number(r.unread_count) || 0) > 0) cur.hasUnread = true;
        agg[pid] = cur;
      });
      // get_channel_unreads already excludes the open channel (it's marked read),
      // so its mention/unread don't count. We keep pings for OTHER channels of
      // the active server — a mention elsewhere still badges the avatar. Only
      // suppress the plain-unread dot of the active server (you're in it).
      const activeServer = window.location.pathname.match(/^\/s\/([^/]+)/)?.[1];
      if (activeServer && agg[activeServer]) agg[activeServer] = { ...agg[activeServer], hasUnread: false };
      setUnread(agg);
    }

    loadServers(); loadFolders(); loadMap(); loadMe();
    loadNotifySettings().then(loadUnreads);

    const onChanged = () => { loadServers(); loadFolders(); loadMap(); };
    window.addEventListener('servers:changed', onChanged);

    // A channel was read (open ChannelChat) → drop that server's badge now.
    const onChannelRead = () => { loadUnreads(); };
    window.addEventListener('prosto:channel-read', onChannelRead);
    // Notify settings changed (mute / level) → refresh dimming + badges.
    const onNotifyChanged = () => { loadNotifySettings().then(loadUnreads); };
    window.addEventListener('prosto:server-notify-changed', onNotifyChanged);
    // Refresh persistent unreads periodically (covers offline catch-up).
    const unreadPoll = setInterval(() => { loadNotifySettings().then(loadUnreads); }, 60000);

    // Debounced authoritative refresh: whether a message pings ME depends on my
    // per-server notify settings (level / mute / suppress @everyone / roles),
    // which only the DB knows — so we NEVER guess with a client-side regex
    // (that caused pings to show on muted / pings-off servers). Instead a new
    // message just schedules a get_channel_unreads refresh, which counts only
    // notifications the server actually created (already settings-filtered).
    let unreadDebounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleUnreads = () => {
      unreadRequestId += 1;
      if (unreadDebounce) clearTimeout(unreadDebounce);
      unreadDebounce = setTimeout(() => { loadUnreads(); }, 400);
    };

    const ch = sb
      .channel('my-servers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, () => { loadServers(); loadMap(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => loadServers())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = payload.new as any;
        const pid = mapRef.current.get(row?.channel_id);
        if (!pid) return;
        if (window.location.pathname.startsWith(`/s/${pid}`)) return;
        if (meRef.current && row.sender_id === meRef.current.id) return;
        // Optimistic PLAIN-unread dot only (never a ping — that's settings-gated
        // and reconciled by the debounced refresh). Muted servers get no dot.
        const muted = !!servers.find((s) => s.public_id === pid && mutedIds.has(s.id));
        if (!muted) {
          setUnread((prev) => {
            const cur = prev[pid] ?? { pings: 0, hasUnread: false };
            if (cur.hasUnread) return prev;
            return { ...prev, [pid]: { pings: cur.pings, hasUnread: true } };
          });
        }
        scheduleUnreads();
      })
      // My mention notifications (settings-filtered by the DB) → refresh pings.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = payload.new as any;
        if (row?.type === 'mention' && meRef.current && row.user_id === meRef.current.id) scheduleUnreads();
      })
      // Mute / level changed on any device → re-dim + re-badge live (fixes the
      // "mute doesn't apply until reload" bug and syncs web ↔ desktop).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_notify_settings' }, () => {
        loadNotifySettings().then(loadUnreads);
      })
      // Read on another device (channel_reads) → refresh badges here.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_reads' }, () => { scheduleUnreads(); })
      .subscribe();

    return () => {
      active = false;
      window.removeEventListener('servers:changed', onChanged);
      window.removeEventListener('prosto:channel-read', onChannelRead);
      window.removeEventListener('prosto:server-notify-changed', onNotifyChanged);
      clearInterval(unreadPoll);
      if (unreadDebounce) clearTimeout(unreadDebounce);
      sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the rail snapshot so the next reload paints instantly from cache.
  useEffect(() => {
    if (servers.length || folders.length) writeRailCache({ servers, folders });
  }, [servers, folders]);

  // Mirror each server's ping count onto its browser tab (top strip badge).
  useEffect(() => {
    for (const s of servers) {
      setTabMeta(`s:${s.public_id}`, { ping: unread[s.public_id]?.pings ?? 0 });
    }
  }, [unread, servers]);

  useEffect(() => {
    if (!menu && !folderMenu) return;
    const close = () => { setMenu(null); setFolderMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [menu, folderMenu]);

  function persistExpanded(next: Set<string>) {
    setExpanded(next);
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  }
  function toggleFolder(id: string) {
    const n = new Set(expanded); if (n.has(id)) n.delete(id); else n.add(id); persistExpanded(n);
  }

  // ── Grouping ──
  const pinned = useMemo(() => servers.filter((s) => s.pinned), [servers]);
  const loose = useMemo(() => servers.filter((s) => !s.pinned && !s.folder_id).sort((a, b) => (a.sort_pos ?? 0) - (b.sort_pos ?? 0)), [servers]);
  const byFolder = useMemo(() => {
    const m = new Map<string, ServerItem[]>();
    servers.filter((s) => !s.pinned && s.folder_id).forEach((s) => {
      const arr = m.get(s.folder_id!) ?? []; arr.push(s); m.set(s.folder_id!, arr);
    });
    return m;
  }, [servers]);

  async function setPin(s: ServerItem, pinned: boolean) {
    setMenu(null);
    setServers((prev) => prev.map((x) => (x.id === s.id ? { ...x, pinned } : x)));
    await toggleServerPin(s.id, pinned);
  }

  async function moveToFolder(s: ServerItem, folderId: string | null) {
    setMenu(null);
    setServers((prev) => prev.map((x) => (x.id === s.id ? { ...x, folder_id: folderId, pinned: false } : x)));
    await reorderServers([{ server_id: s.id, folder_id: folderId, position: s.sort_pos ?? 0 }]);
  }

  async function newFolderWith(s: ServerItem) {
    setMenu(null);
    const res = await createServerFolder();
    if ('id' in res && res.id) {
      await reorderServers([{ server_id: s.id, folder_id: res.id, position: 0 }]);
      window.dispatchEvent(new CustomEvent('servers:changed'));
    }
  }

  async function removeFolder(f: FolderItem) {
    setFolderMenu(null);
    await deleteServerFolder(f.id);
    window.dispatchEvent(new CustomEvent('servers:changed'));
  }

  // Copy the server's public (snowflake) id to the clipboard — Discord-style.
  async function copyServerId(s: ServerItem) {
    setMenu(null);
    try { await navigator.clipboard?.writeText(s.public_id); } catch { /* clipboard blocked — ignore */ }
  }

  // "Read all" — clear every channel + bell mention for this server, and drop
  // its rail badge immediately.
  async function markRead(s: ServerItem) {
    setMenu(null);
    setUnread((prev) => { if (!prev[s.public_id]) return prev; const n = { ...prev }; delete n[s.public_id]; return n; });
    await markServerRead(s.id);
    window.dispatchEvent(new CustomEvent('prosto:channel-read', { detail: { channelId: null } }));
  }

  // ── Server drag & drop (reorder loose, move in/out of folders) ──
  // Start a drag and use the round icon tile as the drag ghost, so the preview
  // is a circle that follows the cursor instead of the default square box.
  function onServerDragStart(e: React.DragEvent, serverId: string) {
    setDragServerId(serverId);
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    const tile = (e.currentTarget as HTMLElement).querySelector('[data-tile]') as HTMLElement | null;
    if (tile) e.dataTransfer.setDragImage(tile, tile.offsetWidth / 2, tile.offsetHeight / 2);
  }

  function endServerDrag() {
    setDragServerId(null);
    setDropGap(null);
    setFolderHover(null);
  }

  function onLooseDragOver(e: React.DragEvent, index: number) {
    if (!dragServerId) return;
    e.preventDefault();
    if (folderHover) setFolderHover(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    setDropGap(after ? index + 1 : index);
  }

  // Drop onto the loose list: reorder a loose server, or pull a server out of
  // its folder and drop it into the loose column at the indicated position.
  function commitLooseDrop() {
    const from = dragServerId;
    const gap = dropGap;
    endServerDrag();
    if (!from || gap == null) return;
    const dragged = servers.find((s) => s.id === from);
    if (!dragged) return;
    const ids = loose.map((s) => s.id);
    const wasLoose = !dragged.folder_id && !dragged.pinned;
    if (wasLoose) {
      const fi = ids.indexOf(from);
      if (fi < 0) return;
      ids.splice(fi, 1);
      const insertAt = gap > fi ? gap - 1 : gap;
      ids.splice(insertAt, 0, from);
      if (ids.join('|') === loose.map((s) => s.id).join('|')) return; // dropped in place
    } else {
      ids.splice(Math.min(gap, ids.length), 0, from);
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    setServers((prev) => prev.map((s) => {
      if (s.id === from) return { ...s, folder_id: null, pinned: false, sort_pos: order.get(from) ?? 0 };
      return order.has(s.id) ? { ...s, sort_pos: order.get(s.id)! } : s;
    }));
    reorderServers(ids.map((id, i) => ({ server_id: id, folder_id: null, position: i })));
  }

  // Drop onto a folder: move the dragged server into it.
  function commitFolderDrop(folderId: string) {
    const from = dragServerId;
    endServerDrag();
    if (!from) return;
    const dragged = servers.find((s) => s.id === from);
    if (!dragged || dragged.folder_id === folderId) return;
    moveToFolder(dragged, folderId);
  }

  return (
    <>
      <div className="flex w-full flex-col items-center gap-2">
        {/* Pinned */}
        {pinned.map((s) => <ServerIcon key={s.id} s={s} pathname={pathname} unread={unread} muted={mutedServers.has(s.public_id)} onContext={(x, y) => setMenu({ server: s, x, y })} pinned />)}
        {pinned.length > 0 && <span className="my-1 h-px w-7 bg-border/40" />}

        {/* Folders — a colour-tinted column groups the servers inside; drag a
            server onto a folder to drop it in. */}
        {folders.map((f) => {
          const items = byFolder.get(f.id) ?? [];
          const open = expanded.has(f.id);
          const isTarget = dragServerId != null && folderHover === f.id;
          const anyPing = items.some((s) => (unread[s.public_id]?.pings ?? 0) > 0);
          const anyUnread = items.some((s) => { const u = unread[s.public_id]; return !!u && (u.pings > 0 || u.hasUnread); });
          const accent = f.color ?? undefined;
          return (
            <div
              key={f.id}
              onDragOver={dragServerId ? (e) => { e.preventDefault(); setFolderHover(f.id); if (dropGap !== null) setDropGap(null); } : undefined}
              onDrop={dragServerId ? (e) => { e.preventDefault(); commitFolderDrop(f.id); } : undefined}
              className={cn(
                'flex w-full flex-col items-center gap-2 transition-colors',
                open && 'rounded-[20px] py-2',
                open && !accent && 'bg-accent/40',
              )}
              style={open && accent ? { backgroundColor: `${accent}22` } : undefined}
            >
              {/* Folder tile — 2×2 preview when closed, open-folder glyph when expanded. */}
              <div className="relative flex items-center justify-center">
                {/* Unread pill (sits outside the tile's clipped/rounded box). */}
                {!open && anyUnread && (
                  <span className={cn(
                    'absolute -left-[9px] top-1/2 -translate-y-1/2 rounded-full',
                    anyPing ? 'h-2.5 w-2.5 bg-warning' : 'h-2 w-2 bg-foreground',
                  )} />
                )}
                <button
                  type="button"
                  onClick={() => toggleFolder(f.id)}
                  onContextMenu={(e) => { e.preventDefault(); setFolderMenu({ folder: f, x: e.clientX, y: e.clientY }); }}
                  title={f.name ?? t('folder')}
                  className={cn(
                    'group grid h-10 w-10 grid-cols-2 place-items-center gap-0.5 overflow-hidden rounded-2xl bg-accent/50 p-1 transition-all',
                    !open && 'hover:rounded-xl hover:bg-accent/70',
                    isTarget && 'scale-110 ring-2 ring-link ring-offset-2 ring-offset-background',
                  )}
                  style={{ backgroundColor: accent ? `${accent}40` : undefined }}
                >
                  {open ? (
                    <Folder className="col-span-2 row-span-2 h-5 w-5" style={{ color: accent }} />
                  ) : items.length === 0 ? (
                    <FolderPlus className="col-span-2 row-span-2 h-4 w-4 text-muted-foreground" />
                  ) : (
                    items.slice(0, 4).map((s) => (
                      <span key={s.id} className="flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-background/50">
                        {s.icon_url
                          ? <Image src={s.icon_url} alt="" width={16} height={16} unoptimized className="h-full w-full object-cover" />
                          : <span className="text-[8px] font-bold">{s.name[0]?.toUpperCase()}</span>}
                      </span>
                    ))
                  )}
                </button>
              </div>
              {open && items.map((s) => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={(e) => onServerDragStart(e, s.id)}
                  onDragEnd={endServerDrag}
                  className={cn('flex w-full justify-center', dragServerId === s.id && 'opacity-40')}
                >
                  <ServerIcon s={s} pathname={pathname} unread={unread} muted={mutedServers.has(s.public_id)} onContext={(x, y) => setMenu({ server: s, x, y })} />
                </div>
              ))}
            </div>
          );
        })}

        {/* Loose servers (draggable to reorder, with a drop-line indicator) */}
        {loose.map((s, i) => (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => onServerDragStart(e, s.id)}
            onDragEnd={endServerDrag}
            onDragOver={(e) => onLooseDragOver(e, i)}
            onDrop={commitLooseDrop}
            className={cn('relative flex w-full justify-center', dragServerId === s.id && 'opacity-40')}
          >
            {dragServerId && !folderHover && dropGap === i && (
              <span className="pointer-events-none absolute -top-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-link" />
            )}
            <ServerIcon s={s} pathname={pathname} unread={unread} muted={mutedServers.has(s.public_id)} onContext={(x, y) => setMenu({ server: s, x, y })} />
            {dragServerId && !folderHover && dropGap === loose.length && i === loose.length - 1 && (
              <span className="pointer-events-none absolute -bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-link" />
            )}
          </div>
        ))}

        {/* Create */}
        <button type="button" onClick={() => setCreateOpen(true)} title={t('createTitle')} className="flex h-11 w-11 items-center justify-center">
          <span className="glass-tile flex h-10 w-10 items-center justify-center rounded-full bg-accent/60 text-success transition-all hover:rounded-2xl hover:bg-success/20">
            <Plus className="h-5 w-5" />
          </span>
        </button>

        {/* Discover */}
        <button type="button" onClick={() => setDiscoverOpen(true)} title={t('discoverTitle')} className="flex h-11 w-11 items-center justify-center">
          <span className="glass-tile flex h-10 w-10 items-center justify-center rounded-full bg-accent/60 text-link transition-all hover:rounded-2xl hover:bg-link/20">
            <Compass className="h-5 w-5" />
          </span>
        </button>
      </div>

      {createOpen && <CreateServerModal onClose={() => setCreateOpen(false)} />}
      {discoverOpen && <ServerDiscovery onClose={() => setDiscoverOpen(false)} />}

      {/* Server context menu */}
      {menu && typeof document !== 'undefined' && createPortal(
        <div
          className="surface-solid fixed z-[10001] min-w-[190px] overflow-hidden rounded-lg border border-border py-1 shadow-2xl animate-fade-in"
          style={{ top: Math.min(menu.y, window.innerHeight - 260), left: Math.min(menu.x, window.innerWidth - 210) }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuButton icon={menu.server.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} label={menu.server.pinned ? t('unpin') : t('pin')} onClick={() => setPin(menu.server, !menu.server.pinned)} />
          <MenuButton icon={<FolderPlus className="h-4 w-4" />} label={t('newFolder')} onClick={() => newFolderWith(menu.server)} />
          {menu.server.folder_id && (
            <MenuButton icon={<X className="h-4 w-4" />} label={t('removeFromFolder')} onClick={() => moveToFolder(menu.server, null)} />
          )}
          {folders.filter((f) => f.id !== menu.server.folder_id).length > 0 && <div className="my-1 h-px bg-border/60" />}
          {folders.filter((f) => f.id !== menu.server.folder_id).map((f) => (
            <MenuButton key={f.id} icon={<Folder className="h-4 w-4" style={{ color: f.color ?? undefined }} />} label={f.name || t('folder')} onClick={() => moveToFolder(menu.server, f.id)} />
          ))}
          <div className="my-1 h-px bg-border/60" />
          <MenuButton icon={<CheckCheck className="h-4 w-4" />} label={t('markRead')} onClick={() => markRead(menu.server)} />
          <MenuButton icon={<Bell className="h-4 w-4" />} label={t('notifySettings')} onClick={() => { setNotifyFor(menu.server); setMenu(null); }} />
          <div className="my-1 h-px bg-border/60" />
          <MenuButton icon={<Copy className="h-4 w-4" />} label={t('copyId')} onClick={() => copyServerId(menu.server)} />
        </div>,
        document.body,
      )}

      {/* Per-server notification settings popover */}
      {notifyFor && (
        <ServerNotifyMenu
          server={notifyFor}
          onClose={() => setNotifyFor(null)}
        />
      )}

      {/* Folder context menu */}
      {folderMenu && typeof document !== 'undefined' && createPortal(
        <div
          className="surface-solid fixed z-[10001] min-w-[170px] overflow-hidden rounded-lg border border-border py-1 shadow-2xl animate-fade-in"
          style={{ top: Math.min(folderMenu.y, window.innerHeight - 100), left: Math.min(folderMenu.x, window.innerWidth - 190) }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuButton icon={<Trash2 className="h-4 w-4" />} label={t('deleteFolder')} danger onClick={() => removeFolder(folderMenu.folder)} />
        </div>,
        document.body,
      )}
    </>
  );
}

function MenuButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors', danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent/60')}
    >
      {icon} <span className="truncate">{label}</span>
    </button>
  );
}

/** Per-server notification settings — centred popover (level, mention filters,
 *  mute). Loads current settings, saves optimistically via RPC, and broadcasts
 *  `prosto:server-notify-changed` so the rail re-dims / re-badges instantly. */
function ServerNotifyMenu({ server, onClose }: { server: ServerItem; onClose: () => void }) {
  const t = useT('servers');
  const [level, setLevel] = useState<'all' | 'mentions' | 'nothing'>('all');
  const [suppressEveryone, setSuppressEveryone] = useState(false);
  const [suppressRoles, setSuppressRoles] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const sbRef = useRef(createClient());

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('get_my_server_notify').then(({ data }: any) => {
      if (!active || !Array.isArray(data)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = data.find((r: any) => r.server_id === server.id);
      if (row) {
        setLevel(row.level ?? 'all');
        setSuppressEveryone(!!row.suppress_everyone);
        setSuppressRoles(!!row.suppress_roles);
        setMutedUntil(row.muted_until ?? null);
      }
    });
    return () => { active = false; };
  }, [server.id]);

  const isMuted = !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();

  function persist(patch: Parameters<typeof setServerNotifySettings>[1]) {
    void setServerNotifySettings(server.id, patch);
    window.dispatchEvent(new CustomEvent('prosto:server-notify-changed'));
  }

  function pickLevel(l: 'all' | 'mentions' | 'nothing') {
    setLevel(l);
    persist({ level: l });
  }
  function toggleEveryone() { const v = !suppressEveryone; setSuppressEveryone(v); persist({ suppressEveryone: v }); }
  function toggleRoles() { const v = !suppressRoles; setSuppressRoles(v); persist({ suppressRoles: v }); }
  function muteFor(ms: number | null) {
    if (ms === null) { setMutedUntil(null); persist({ clearMute: true }); return; }
    // ms === Infinity → "until I turn it back on" (far-future sentinel).
    const until = ms === Infinity ? new Date(Date.now() + 100 * 365 * 24 * 3600_000) : new Date(Date.now() + ms);
    setMutedUntil(until.toISOString());
    persist({ mutedUntil: until.toISOString() });
  }

  const levels: { key: 'all' | 'mentions' | 'nothing'; label: string }[] = [
    { key: 'all', label: t('notifyAll') },
    { key: 'mentions', label: t('notifyMentions') },
    { key: 'nothing', label: t('notifyNothing') },
  ];
  const muteOptions: { label: string; ms: number | null }[] = [
    { label: t('mute15m'), ms: 15 * 60_000 },
    { label: t('mute1h'), ms: 60 * 60_000 },
    { label: t('mute8h'), ms: 8 * 3600_000 },
    { label: t('muteUntilOn'), ms: Infinity },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-xs overflow-hidden rounded-2xl bg-card p-4 shadow-2xl ring-1 ring-border/40" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate text-[14px] font-bold">{server.name}</p>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {/* Level */}
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t('notifyLevel')}</p>
        <div className="mb-3 flex flex-col gap-0.5">
          {levels.map((l) => (
            <button key={l.key} type="button" onClick={() => pickLevel(l.key)}
              className={cn('flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors',
                level === l.key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50')}>
              {l.label}
              {level === l.key && <CheckCheck className="h-3.5 w-3.5 text-link" />}
            </button>
          ))}
        </div>

        {/* Suppression toggles */}
        <div className="mb-3 flex flex-col gap-0.5">
          <ToggleRow icon={<AtSign className="h-4 w-4" />} label={t('suppressEveryone')} on={suppressEveryone} onClick={toggleEveryone} />
          <ToggleRow icon={<Users className="h-4 w-4" />} label={t('suppressRoles')} on={suppressRoles} onClick={toggleRoles} />
        </div>

        {/* Mute */}
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          {t('muteServer')}
        </p>
        {isMuted ? (
          <button type="button" onClick={() => muteFor(null)}
            className="flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/70">
            {t('unmute')}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {muteOptions.map((o) => (
              <button key={o.label} type="button" onClick={() => muteFor(o.ms)}
                className="rounded-lg bg-accent/50 px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ToggleRow({ icon, label, on, onClick }: { icon: React.ReactNode; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent/50">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={cn('flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors', on ? 'bg-link' : 'bg-muted')}>
        <span className={cn('h-4 w-4 rounded-full bg-white transition-transform', on && 'translate-x-4')} />
      </span>
    </button>
  );
}

function ServerIcon({ s, pathname, unread, muted, onContext, pinned }: {
  s: ServerItem; pathname: string; unread: Record<string, { pings: number; hasUnread: boolean }>;
  muted?: boolean; onContext: (x: number, y: number) => void; pinned?: boolean;
}) {
  const router = useRouter();
  const homeHref = `${site.routes.server(s.public_id)}/home`;
  const isActive = pathname.startsWith(`/s/${s.public_id}`);
  const initial = s.name[0]?.toUpperCase() ?? '?';
  const u = unread[s.public_id];
  // Pings (mentions) always show — even while you're IN the server — because a
  // mention in another channel must stay visible until you read it (Discord).
  const pings = u?.pings ?? 0;
  // Plain-unread dot: only when not active, not muted, and no ping badge.
  const showDot = !isActive && !!u && u.hasUnread && pings === 0 && !muted;
  return (
    <Tooltip
      side="right"
      content={
        <div className="min-w-[140px]">
          <p className="flex items-center gap-1.5 text-[14px] font-bold leading-tight">
            {s.is_verified && <ServerVerifiedIcon className="h-3.5 w-3.5 shrink-0 text-sky-300" />}
            <span className="truncate">{s.name}</span>
          </p>
          <p className="mt-1 flex items-center gap-3 text-[12px] font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />{s.online_count ?? 0}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground/50" />{s.member_count ?? 0}</span>
          </p>
        </div>
      }
    >
      <Link
        href={homeHref}
        // Warm the server-home route (RSC + data) on hover/focus so the first
        // open is instant with no skeleton (Discord-style). router.prefetch pulls
        // the data too, unlike the default dynamic-route Link prefetch.
        onPointerEnter={() => router.prefetch(homeHref)}
        onFocus={() => router.prefetch(homeHref)}
        onContextMenu={(e) => { e.preventDefault(); onContext(e.clientX, e.clientY); }}
        className="group relative flex h-11 w-11 items-center justify-center"
      >
        {isActive
          ? <span className="absolute -left-2 h-6 w-1 rounded-full bg-link" />
          : showDot && <span className="absolute -left-2 h-2 w-2 rounded-full bg-foreground" />}
        <div data-tile className={cn(
          'glass-tile flex h-10 w-10 items-center justify-center overflow-hidden bg-accent text-foreground transition-all',
          isActive ? 'rounded-2xl' : 'rounded-full group-hover:rounded-2xl',
          muted && !isActive && 'opacity-40',           // dimmed while muted (Discord-style)
        )}>
          {s.icon_url
            ? <Image src={s.icon_url} alt={s.name} width={40} height={40} unoptimized className="h-full w-full object-cover" />
            : <span className="text-sm font-bold">{initial}</span>}
        </div>
        {pinned && (
          <span className="absolute -left-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-link text-white ring-2 ring-background">
            <Pin className="h-2 w-2" />
          </span>
        )}
        {pings > 0 && (
          <span className="absolute -bottom-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
            {pings > 99 ? '99+' : pings}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}
