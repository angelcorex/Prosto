'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Crown } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { VerifiedBadge, ModeratorBadge, PremiumBadge, BotBadge, MiniProfilePopup, Skeleton, renderEmojiNodes } from '@/components/ui';
import { AvatarImage } from '@/components/ui/avatar-image';
import { AvatarWithStatus, effectiveStatus, seedPresence, getPresence, usePresenceTick, DeviceBadge } from '@/features/presence';
import { roleNameStyle, roleNameClass } from '../roles/permissions';
import { loadServerEmojis } from '@/lib/emoji';
import { setTabMeta } from '@/features/tabs';

interface Member {
  id: string; username: string; display_name: string | null; avatar_url: string | null;
  is_verified: boolean; is_moderator: boolean; is_premium?: boolean; is_bot?: boolean; status: string | null; last_seen: string | null; is_owner: boolean;
  role_color?: string | null; role_color2?: string | null; role_glow?: string | null; role_icon?: string | null;
  hoist_role_id?: string | null; hoist_role_name?: string | null; hoist_role_pos?: number | null;
}

type Row = { m: Member; status: string | null; lastSeen: string | null };

// ── Members cache (memory + sessionStorage), same pattern as ServerSidebar ──
// Revisiting a server renders the list instantly from the snapshot instead of
// flashing a skeleton; the network refresh then reconciles in the background.
type MembersCacheEntry = { serverId: string; members: Member[] };
const membersCache = new Map<string, MembersCacheEntry>();
const membersSsKey = (pid: string) => `prosto:members-cache:${pid}`;

function readMembersCache(pid: string): MembersCacheEntry | undefined {
  const mem = membersCache.get(pid);
  if (mem) return mem;
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(membersSsKey(pid));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as MembersCacheEntry;
    membersCache.set(pid, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function writeMembersCache(pid: string, entry: MembersCacheEntry): void {
  membersCache.set(pid, entry);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(membersSsKey(pid), JSON.stringify(entry));
  } catch {
    /* quota / serialization — non-fatal */
  }
}

export function ServerMembersPanel() {
  const t = useT('servers');
  const pathname = usePathname();
  const sbRef = useRef(createClient());

  const serverPid = pathname.match(/^\/s\/([^/]+)/)?.[1] ?? null;
  // Seed from the in-memory cache only (empty on the server + first client paint,
  // so no hydration mismatch); sessionStorage is read in the effect below.
  const memSeed = serverPid ? membersCache.get(serverPid) : undefined;

  const [members, setMembers] = useState<Member[]>(memSeed?.members ?? []);
  const [loading, setLoading] = useState(!memSeed);
  const [serverId, setServerId] = useState<string | null>(memSeed?.serverId ?? null);

  // Re-render whenever anyone's live presence changes (shared store, same as DMs).
  usePresenceTick();

  useEffect(() => {
    if (!serverPid) return;
    const pid = serverPid;
    const sb = sbRef.current;
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    // The server UUID never changes for a pid, so if we already know it (from
    // cache) we can skip get_server and hit get_server_members directly — it
    // enforces its own membership check via RLS.
    let sid: string | null = readMembersCache(pid)?.serverId ?? null;
    async function load() {
      if (!sid) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: srv } = await (sb as any).rpc('get_server', { p_public_id: pid });
        const info = Array.isArray(srv) ? srv[0] : srv;
        if (!active || !info) return;
        sid = info.id as string;
        setServerId(sid);
      }
      const serverUuid = sid;
      // Warm this server's custom emojis so members whose names contain them
      // render as images (not the `:name:` fallback). The registry version bump
      // re-resolves any already-rendered names once the emojis land.
      void loadServerEmojis(serverUuid).catch(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_server_members', { p_server: serverUuid });
      if (active && Array.isArray(data)) {
        // Seed the shared presence store so dots match DMs (live events override).
        (data as Member[]).forEach((m) => seedPresence(m.id, m.status, m.last_seen));
        setMembers(data);
        writeMembersCache(pid, { serverId: serverUuid, members: data as Member[] });
      }
      if (active) setLoading(false);
      if (active && !channel) {
        channel = sb
          .channel(`server-members:${serverUuid}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: `server_id=eq.${serverUuid}` }, () => load())
          .subscribe();
      }
    }
    // Seed from cache so switching servers shows the list instantly; only show
    // the skeleton when we have nothing cached for this server yet.
    const cached = readMembersCache(pid);
    if (cached) {
      setServerId(cached.serverId);
      setMembers(cached.members);
      setLoading(false);
    } else {
      setServerId(null);
      setMembers([]);
      setLoading(true);
    }
    load();
    const onChanged = () => load();
    window.addEventListener('server:changed', onChanged);
    const poll = setInterval(load, 60000);
    return () => { active = false; window.removeEventListener('server:changed', onChanged); clearInterval(poll); if (channel) sb.removeChannel(channel); };
  }, [serverPid]);

  // Live status per member (shared store, falls back to the seeded SSR value).
  const withStatus: Row[] = members.map((m) => {
    const live = getPresence(m.id);
    return { m, status: live?.status ?? m.status, lastSeen: live?.last_seen ?? m.last_seen };
  });
  const online = withStatus.filter((x) => effectiveStatus(x.status, x.lastSeen) !== 'offline');
  const offline = withStatus.filter((x) => effectiveStatus(x.status, x.lastSeen) === 'offline');

  // Surface the live online count on this server's browser tab.
  useEffect(() => {
    if (serverPid) setTabMeta(`s:${serverPid}`, { count: online.length });
  }, [serverPid, online.length]);

  // Hoisted roles get their own sections above everyone, ordered by hierarchy.
  const hoistGroups = new Map<string, { name: string; pos: number; rows: Row[] }>();
  const plain: Row[] = [];
  for (const row of online) {
    const id = row.m.hoist_role_id;
    if (id) {
      const g = hoistGroups.get(id) ?? { name: row.m.hoist_role_name ?? '', pos: row.m.hoist_role_pos ?? 0, rows: [] };
      g.rows.push(row);
      hoistGroups.set(id, g);
    } else {
      plain.push(row);
    }
  }
  const hoisted = [...hoistGroups.values()].sort((a, b) => b.pos - a.pos);

  if (loading && members.length === 0) {
    return (
      <div className="flex h-full flex-col gap-1 px-3 py-4">
        <Skeleton className="mb-1 h-3 w-24" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
      {hoisted.map((g) => (
        <Section key={g.name} label={`${g.name} — ${g.rows.length}`} rows={g.rows} serverId={serverId} />
      ))}
      <Section label={`${t('online')} — ${plain.length}`} rows={plain} serverId={serverId} />
      {offline.length > 0 && <Section label={`${t('offline')} — ${offline.length}`} rows={offline} serverId={serverId} dim />}
    </div>
  );
}

function Section({ label, rows, serverId, dim }: { label: string; rows: Row[]; serverId: string | null; dim?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{label}</p>
      {rows.map(({ m, status, lastSeen }) => {
        const name = m.display_name ?? m.username;
        const initial = name[0]?.toUpperCase() ?? '?';
        // Aurora name for premium members — a role GRADIENT wins on servers.
        const premiumName = !!m.is_premium && !m.role_color2;
        return (
          <MiniProfilePopup
            key={m.id}
            user={{ username: m.username }}
            serverId={serverId ?? undefined}
            memberId={m.id}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/40 ${dim ? 'opacity-50' : ''}`}
          >
            <AvatarWithStatus status={status} lastSeen={lastSeen} size={32} dotSize={8}>
              {m.avatar_url
                ? <AvatarImage src={m.avatar_url} alt={name} sizes="32px" className="object-cover" />
                : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{initial}</span>}
            </AvatarWithStatus>
            <span className={cn('truncate text-[14px] font-medium', premiumName ? 'aurora-text aurora-text-glow' : roleNameClass(m.role_color, m.role_color2))} style={premiumName ? undefined : roleNameStyle(m.role_color, m.role_color2, m.role_glow)}>{renderEmojiNodes(name)}</span>
            {m.role_icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.role_icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
            )}
            {m.is_bot && <BotBadge size="sm" />}
            {m.is_verified && <VerifiedBadge size="sm" />}
            {m.is_moderator && <ModeratorBadge size="sm" />}
            {m.is_premium && <PremiumBadge size="sm" />}
            {!m.is_bot && <DeviceBadge userId={m.id} />}
            {m.is_owner && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" />}
          </MiniProfilePopup>
        );
      })}
    </div>
  );
}
