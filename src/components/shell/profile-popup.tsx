'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Pencil, Copy, LogOut, CalendarDays, MoreHorizontal, Send } from 'lucide-react';

import { AvatarImage } from '@/components/ui/avatar-image';
import { useState, useEffect, useRef, useTransition } from 'react';

import { cn }            from '@/lib/utils/cn';
import { VerifiedBadge, UserContextMenu, ModeratorBadge, PremiumBadge, BotBadge, EmojiText, renderEmojiNodes, UsernameAliases } from '@/components/ui';
import { createClient }  from '@/lib/supabase/client';
import { site }          from '@/config';
import { logoutCurrentAccount, AccountSwitcherRow, AccountSwitchOverlay } from '@/features/accounts';
import { useT }          from '@/providers/i18n-provider';
import { AvatarWithStatus, STATUS_COLOR, usePresence, publishPresence, type PresenceStatus } from '@/features/presence';
import { setStatus as setStatusAction, setCustomStatus as setCustomStatusAction } from '@/features/presence/actions';
import { MemberRolePills } from '@/features/servers/roles/member-role-pills';
import { ProfileModActions } from '@/features/servers/moderation/profile-mod-actions';
import { PostText } from '@/features/posts/components/post-text';
import { ProfileConnections, NowPlayingCard, PROVIDERS } from '@/features/connections';
import type { PublicConnection, ProviderId } from '@/features/connections';

export interface ProfilePopupUser {
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  is_verified?: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
  is_bot?: boolean;
  status?: string | null;
  last_seen?: string | null;
  created_at?: string | null;
  public_id?: string | number | null;
  custom_status?: string | null;
}

interface ProfilePopupProps {
  user: ProfilePopupUser;
  accountMenu?: boolean;
  onClose?: () => void;
  /** Hide the inline "send a message" composer (e.g. the DM right-panel card,
   *  where you're already in the conversation). */
  hideComposer?: boolean;
  /** Server context — enables the roles section + assignment. */
  serverId?: string;
  memberId?: string;
  /** Account menu only — opens the multi-account manager / add-account modal
   *  (rendered by the host so they survive this popup closing). */
  onManageAccounts?: () => void;
  onAddAccount?: () => void;
}

const rowCls = 'flex w-full items-center gap-3 px-4 py-3 text-[14px] font-medium text-foreground transition-colors duration-fast hover:bg-accent/60';

// Cache full profile data per username so re-opening the popup is instant
// (no skeleton flash / avatar flicker). Refreshed quietly in the background.
type FullProfile = ProfilePopupUser & { id?: string };
const profileCache = new Map<string, { full: FullProfile; stats: { followers: number; following: number; posts: number } | null; mine: boolean; connections?: PublicConnection[]; aliases?: string[] }>();

export function ProfilePopup({ user, accountMenu = false, onClose, hideComposer = false, serverId, memberId, onManageAccounts, onAddAccount }: ProfilePopupProps) {
  const t   = useT('profile');
  const tn  = useT('nav');
  const tMsg = useT('messages');
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    const { to } = await logoutCurrentAccount();
    // Hard reload so the app layout's account-hygiene guard wipes this account's
    // local state before the next one renders.
    window.location.href = to;
  }
  const cached = profileCache.get(user.username);
  const [stats, setStats] = useState<{ followers: number; following: number; posts: number } | null>(cached?.stats ?? null);
  const [full, setFull]   = useState<FullProfile>(cached?.full ?? user);
  const [mine, setMine]   = useState(cached?.mine ?? accountMenu);
  const [connections, setConnections] = useState<PublicConnection[]>(cached?.connections ?? []);
  const [aliases, setAliases] = useState<string[]>(cached?.aliases ?? []);

  // Opened from a bare @mention (only a username, no id) and not cached: we must
  // resolve the profile before showing anything, otherwise an empty "nobody"
  // card flashes for a frame. `notFound` = the handle resolved to no profile.
  const needsResolve = !accountMenu && !(user as FullProfile).id && !cached?.full?.id;
  const [resolving, setResolving] = useState(needsResolve);
  const [notFound, setNotFound]   = useState(false);

  const live = usePresence(full.id, full.status, full.last_seen);
  const displayName = full.display_name ?? full.username;
  const initial     = displayName[0]?.toUpperCase() ?? '?';

  // Grow from the anchored corner so the spring expand doesn't drift sideways:
  // the account panel opens upward (bottom-left), other popovers open downward.
  const popOrigin = accountMenu ? 'left bottom' : 'left top';

  useEffect(() => {
    // No username to resolve (e.g. the account panel of a not-yet-completed
    // profile) — show whatever we were given, don't query for a stranger.
    if (!user.username) return;
    let active = true;
    const sb = createClient();

    // The handle we were given may be an ADDITIONAL username (Super Prosto
    // alias), not the canonical primary. All profile queries + RPCs key off the
    // primary `username`, so resolve the alias to its owner's primary first —
    // otherwise an aliased @mention would show an empty "nobody" profile.
    async function load() {
      let canonical = user.username as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: resolved } = await (sb as any).rpc('resolve_username', { p_handle: user.username });
      if (typeof resolved === 'string' && resolved) canonical = resolved;
      if (!active) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any)
        .from('profiles')
        .select('id, username, display_name, avatar_url, banner_url, pronouns, bio, is_verified, is_moderator, is_premium, is_bot, status, last_seen, custom_status, created_at, public_id:public_id::text')
        .eq('username', canonical)
        .maybeSingle();
      if (!active) return;
      if (data) {
        setFull(prev => ({ ...prev, ...data }));
        setResolving(false);
        const { data: { user: au } } = await sb.auth.getUser();
        const isMine = !!au && au.id === data.id;
        if (active) {
          setMine(isMine);
          const entry = profileCache.get(canonical) ?? { full: data, stats: null, mine: isMine };
          profileCache.set(canonical, { ...entry, full: { ...entry.full, ...data }, mine: isMine });
        }
      } else {
        // Handle resolved to no profile (or never existed) → "no such username".
        setResolving(false);
        setNotFound(true);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('get_profile_stats', { uname: canonical }).then(({ data }: any) => {
        if (active && data?.[0]) {
          const s = { followers: data[0].followers, following: data[0].following, posts: data[0].posts };
          setStats(s);
          const entry = profileCache.get(canonical);
          if (entry) profileCache.set(canonical, { ...entry, stats: s });
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('get_profile_connections', { p_username: canonical }).then(({ data }: any) => {
        if (active && Array.isArray(data)) {
          setConnections(data);
          const entry = profileCache.get(canonical);
          if (entry) profileCache.set(canonical, { ...entry, connections: data });
        }
      });
      // Additional usernames (Super Prosto) — shown as `also @…` under the handle.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('get_profile_usernames', { p_username: canonical }).then(({ data }: any) => {
        if (active && Array.isArray(data)) {
          const list = data.map((r: { username: string }) => r.username);
          setAliases(list);
          const entry = profileCache.get(canonical);
          if (entry) profileCache.set(canonical, { ...entry, aliases: list });
        }
      });
    }
    load();
    return () => { active = false; };
  }, [user.username]);

  const joined = full.created_at
    ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(full.created_at))
    : null;

  function handleCopyId() {
    navigator.clipboard.writeText(String(full.public_id ?? user.username)).catch(() => {});
    onClose?.();
  }

  // Opened from a bare @mention: while resolving, show a compact loading card
  // instead of an empty "nobody" profile (no flash). If the handle resolved to
  // nothing, tell the user plainly.
  if (notFound) {
    return (
      <div className="animate-profile-pop overflow-hidden rounded-3xl bg-card px-5 py-6 text-center shadow-2xl" style={{ transformOrigin: popOrigin }}>
        <p className="text-[14px] font-medium text-muted-foreground">{t('noSuchUsername')}</p>
        <p className="mt-1 text-[13px] text-muted-foreground/60">@{user.username}</p>
      </div>
    );
  }
  if (resolving) {
    return (
      <div className="animate-profile-pop surface-solid overflow-hidden rounded-3xl shadow-2xl" style={{ transformOrigin: popOrigin }}>
        <div className="h-[88px] w-full animate-pulse bg-secondary" />
        <div className="px-4 pb-5">
          <div className="-mt-8 mb-3 h-[72px] w-[72px] animate-pulse rounded-full bg-secondary ring-[5px] ring-card" />
          <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-secondary/70" />
        </div>
      </div>
    );
  }

  // No full-screen skeleton: the popup always renders from the data we already
  // have (the `user` prop, or the per-username cache on re-open), so it appears
  // instantly at its final shape. Stats/bio/banner fill in from the background
  // query without a skeleton→content swap or layout jump.
  return (
    <div className="animate-profile-pop overflow-hidden rounded-3xl bg-card shadow-2xl" style={{ transformOrigin: popOrigin }}>

      <div className="relative h-[88px] w-full overflow-hidden bg-secondary">
        {full.banner_url && (
          <Image src={full.banner_url} alt="" fill sizes="280px" className="object-cover" unoptimized={full.banner_url.startsWith('blob:')} />
        )}
        {!mine && (
          <UserContextMenu user={{ username: full.username }} openOnClick>
            <button
              type="button"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </UserContextMenu>
        )}
        {full.username && (
          <Link
            href={site.routes.profile(full.username)}
            onClick={onClose}
            title={t('viewProfile')}
            aria-label={t('viewProfile')}
            className={cn(
              'absolute top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60',
              mine ? 'right-3' : 'right-12',
            )}
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="relative px-4">
        <div className="absolute -top-10 left-4">
          <div className="rounded-full ring-[5px] ring-card">
            <AvatarWithStatus status={live.status} lastSeen={live.last_seen} size={72} dotSize={12}>
              {full.avatar_url ? (
                <AvatarImage src={full.avatar_url} alt={initial} sizes="72px" className="object-cover" animate />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-secondary text-3xl font-bold text-link">{initial}</span>
              )}
            </AvatarWithStatus>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 pt-12">
        <p className="flex min-w-0 items-center gap-1.5 text-[17px] font-bold leading-snug">
          <EmojiText content={displayName} clamp className={cn('min-w-0 truncate', full.is_premium && 'aurora-text aurora-text-glow')} />
          {full.is_bot && <BotBadge size="md" />}
          {full.is_verified && <VerifiedBadge size="md" />}
          {full.is_moderator && <ModeratorBadge size="md" />}
          {full.is_premium && <PremiumBadge size="md" />}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5">
          <p className="text-[13px] text-muted-foreground">@{full.username}</p>
          <UsernameAliases
            aliases={aliases}
            displayName={displayName}
            avatarUrl={full.avatar_url}
            className="text-[13px]"
            onNavigate={onClose}
          />
          {full.pronouns?.trim() && (
            <>
              <span className="text-[11px] text-muted-foreground/40">·</span>
              <span className="text-[13px] text-muted-foreground/70">{renderEmojiNodes(full.pronouns.trim())}</span>
            </>
          )}
        </div>
        {full.custom_status?.trim() && (
          <p className="mt-1.5 text-[13px] text-foreground/70">{renderEmojiNodes(full.custom_status.trim())}</p>
        )}
        {full.bio?.trim() && (
          <PostText content={full.bio.trim()} className="mb-0 mt-2 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/70" />
        )}

        {/* A bot has no social graph — hide the follower/following/posts stats. */}
        {!full.is_bot && (
          <div className="mt-2.5 flex items-center gap-4 text-[13px]">
            <span><span className="font-semibold">{stats?.posts ?? 0}</span> <span className="text-muted-foreground">{t('posts')}</span></span>
            <span><span className="font-semibold">{stats?.followers ?? 0}</span> <span className="text-muted-foreground">{t('followers')}</span></span>
            <span><span className="font-semibold">{stats?.following ?? 0}</span> <span className="text-muted-foreground">{t('following')}</span></span>
          </div>
        )}

        {joined && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>{t('joined')} {joined}</span>
          </div>
        )}

        {/* Live "now playing" for any status-capable connected provider. */}
        {connections
          .filter((c) => PROVIDERS[c.provider as ProviderId]?.hasStatus)
          .map((c) => (
            <NowPlayingCard key={c.provider} username={full.username} provider={c.provider as ProviderId} className="mt-3" />
          ))}
        <ProfileConnections connections={connections} compact className="mt-3" />
      </div>

      {!mine && !accountMenu && !hideComposer && full.id && (
        <DmComposer
          targetId={full.id}
          routeId={full.public_id != null ? String(full.public_id) : null}
          placeholder={tMsg('messagePlaceholder', { name: full.display_name ?? full.username })}
          onClose={onClose}
        />
      )}

      {serverId && (memberId ?? full.id) && (
        <MemberRolePills serverId={serverId} memberId={(memberId ?? full.id) as string} />
      )}

      {serverId && !mine && (memberId ?? full.id) && (
        <ProfileModActions serverId={serverId} memberId={(memberId ?? full.id) as string} username={full.username} />
      )}

      {mine && <StatusPicker id={full.id} current={(live.status as PresenceStatus) ?? 'online'} initialCustom={full.custom_status ?? ''} onClose={onClose} />}
      {mine && (
        <div className="mx-3 mb-2 overflow-hidden rounded-2xl bg-secondary/60">
          <Link href="/settings/profile" onClick={onClose} className={rowCls}>
            <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t('editProfile')}
          </Link>
          <button onClick={handleCopyId} className={rowCls}>
            <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
            {t('copyId')}
          </button>
        </div>
      )}

      {mine && accountMenu && (
        <>
          {onManageAccounts && onAddAccount && (
            <div className="mx-3 mb-2 overflow-hidden rounded-2xl bg-secondary/60">
              <AccountSwitcherRow onManage={onManageAccounts} onAdd={onAddAccount} onClosePopup={onClose} />
            </div>
          )}
          <div className="mx-3 mb-3 overflow-hidden rounded-2xl bg-secondary/60">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-3 px-4 py-3 text-[14px] font-medium text-destructive transition-colors duration-fast hover:bg-destructive/10 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {tn('signOut')}
            </button>
          </div>
        </>
      )}
      {loggingOut && <AccountSwitchOverlay />}
      {!(mine && accountMenu) && <div className="mb-2" />}
    </div>
  );
}

/**
 * Inline DM composer inside the profile popup — send a message without first
 * navigating to the profile page. Resolves (or creates) the conversation via
 * `ensure_dm`, sends via `send_dm`, then opens the thread.
 */
function DmComposer({ targetId, routeId, placeholder, onClose }: { targetId: string; routeId: string | null; placeholder: string; onClose?: () => void }) {
  const router = useRouter();
  const tMsg = useT('messages');
  const [value, setValue]   = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send() {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const sb = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conv } = await (sb as any).rpc('ensure_dm', { other: targetId });
    if (!conv) { setSending(false); setError(tMsg('sendFailed')); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sendErr } = await (sb as any).rpc('send_dm', { conv_id: conv as string, body, reply: null });
    if (sendErr) {
      const s = String(sendErr.message ?? '');
      setSending(false);
      setError(s.includes('not_allowed') ? tMsg('sendNotAllowed') : s.includes('blocked') ? tMsg('sendBlocked') : tMsg('sendFailed'));
      return;
    }
    setValue('');
    onClose?.();
    // The /messages/[id] route resolves by the other user's public_id.
    if (routeId) router.push(`/messages/${routeId}`);
    else router.push('/messages');
    router.refresh();
  }

  return (
    <div className="mx-3 mb-2">
      <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-2 py-1.5">
        <input
          ref={inputRef}
          value={value}
          disabled={sending}
          onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !value.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-link transition-colors hover:bg-link/15 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="mt-1 px-2 text-[12px] text-destructive">{error}</p>}
    </div>
  );
}

function StatusPicker({ id, current, initialCustom = '', onClose }: { id?: string; current: PresenceStatus; initialCustom?: string; onClose?: () => void }) {
  const ts = useT('status');
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<PresenceStatus>(current);
  const [custom, setCustom] = useState(initialCustom);
  const [savedCustom, setSavedCustom] = useState(initialCustom);
  const [, startTransition] = useTransition();
  void onClose;

  // Keep in sync if the live status changes elsewhere.
  useEffect(() => { setValue(current); }, [current]);
  useEffect(() => { setCustom(initialCustom); setSavedCustom(initialCustom); }, [initialCustom]);

  const options: PresenceStatus[] = ['online', 'idle', 'dnd', 'offline'];

  function pick(s: PresenceStatus) {
    setValue(s);
    setOpen(false);
    // Instant: broadcast to everyone + optimistic local (fresh last_seen).
    if (id) publishPresence(id, s);
    startTransition(() => { setStatusAction(s); });
  }

  function saveCustom() {
    const v = custom.trim().slice(0, 45);
    if (v === savedCustom) return;
    setSavedCustom(v);
    startTransition(() => { setCustomStatusAction(v); });
  }

  return (
    <div className="mx-3 mb-2 overflow-hidden rounded-2xl bg-secondary/60">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-[14px] font-medium text-foreground transition-colors hover:bg-accent/60"
      >
        <span className={cn('h-3 w-3 shrink-0 rounded-full', STATUS_COLOR[value])} />
        {ts(value)}
        <span className="ml-auto text-[12px] text-muted-foreground/60">{ts('setStatus')}</span>
      </button>

      {open && (
        <div className="border-t border-border/40">
          {options.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-[14px] transition-colors hover:bg-accent/60',
                value === s ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className={cn('h-3 w-3 shrink-0 rounded-full', STATUS_COLOR[s])} />
              {ts(s)}
            </button>
          ))}
          {/* Custom status text (≤45 chars) — replaces @username in DM lists. */}
          <div className="border-t border-border/40 px-4 py-2.5">
            <input
              type="text"
              value={custom}
              maxLength={45}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={saveCustom}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); } }}
              placeholder={ts('customPlaceholder')}
              className="w-full rounded-lg bg-background/60 px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-border/40 focus:ring-link"
            />
          </div>
        </div>
      )}
    </div>
  );
}
