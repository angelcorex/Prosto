'use client';
import { AvatarImage } from '@/components/ui/avatar-image';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Check, X, MessageCircle, UserMinus, UserPlus, Copy, Share2 } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { VerifiedBadge, ModeratorBadge, PremiumBadge, Button, renderEmojiNodes } from '@/components/ui';
import { AvatarWithStatus, DeviceBadge } from '@/features/presence';
import {
  acceptFriendRequest, declineFriendRequest, removeFriend,
  cancelFriendRequest, openConversation, createFriendInvite,
} from '@/features/social';
import type { FriendUser } from './page';

interface Props {
  friends:  FriendUser[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
}

type Tab = 'all' | 'pending';

export function FriendsClient({ friends, incoming, outgoing }: Props) {
  const t = useT('friends');
  const [tab, setTab] = useState<Tab>(incoming.length > 0 ? 'pending' : 'all');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();


  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  async function openInvite() {
    setInviteOpen(true);
    setCopied(false);
    if (inviteUrl) return;
    setInviteBusy(true);
    const res = await createFriendInvite();
    setInviteBusy(false);
    if (res.token) setInviteUrl(`${window.location.origin}/invite/${res.token}`);
  }

  function copyInvite() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function shareInvite() {
    if (!inviteUrl) return;
    if (navigator.share) navigator.share({ url: inviteUrl, title: 'Prosto' }).catch(() => {});
    else copyInvite();
  }

  function run(action: (fd: FormData) => Promise<unknown>, fields: Record<string, string>) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    startTransition(async () => {
      await action(fd);
      window.dispatchEvent(new CustomEvent('friends:changed'));
      router.refresh();
    });
  }

  const pendingCount = incoming.length + outgoing.length;

  return (
    <div className="flex h-full w-full flex-col">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/30 bg-background/80 px-5 py-4 backdrop-blur-sm">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[17px] font-bold">{t('title')}</h1>
        <button
          type="button"
          onClick={openInvite}
          className="ml-auto flex items-center gap-2 rounded-full bg-link px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <UserPlus className="h-[16px] w-[16px]" />
          <span className="hidden sm:inline">{t('inviteButton')}</span>
        </button>
      </div>

      {/* ── Invite modal ── */}
      {inviteOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setInviteOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-link/15 text-link">
                <UserPlus className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold">{t('inviteTitle')}</h2>
                <p className="text-[13px] text-muted-foreground">{t('inviteHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2.5">
              <input
                readOnly
                value={inviteBusy ? '…' : (inviteUrl ?? '')}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none"
              />
              <button
                type="button"
                onClick={copyInvite}
                disabled={!inviteUrl}
                title={t('copy')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="md" onClick={shareInvite} disabled={!inviteUrl}>
                <Share2 className="h-[18px] w-[18px]" />
                {t('share')}
              </Button>
              <Button size="md" onClick={copyInvite} disabled={!inviteUrl}>
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex shrink-0 gap-1.5 border-b border-border/20 px-4 py-2.5">
        {([['all', t('tabAll')], ['pending', t('tabPending')]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex select-none items-center gap-2 rounded-lg px-3.5 py-2 text-[14px] font-semibold transition-colors',
              tab === key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
            )}
          >
            {label}
            {key === 'pending' && incoming.length > 0 && <CountBadge n={incoming.length} />}
          </button>
        ))}
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-3 py-3">
          {tab === 'all' && (
            friends.length === 0
              ? <Empty label={t('empty')} />
              : friends.map(f => (
                  <FriendRow key={f.id} user={f}>
                    <IconBtn title={t('message')} onClick={() => run(openConversation, { target_id: f.id })} disabled={isPending}>
                      <MessageCircle className="h-[18px] w-[18px]" />
                    </IconBtn>
                    <IconBtn title={t('remove')} variant="danger" onClick={() => run(removeFriend, { other_id: f.id })} disabled={isPending}>
                      <UserMinus className="h-[18px] w-[18px]" />
                    </IconBtn>
                  </FriendRow>
                ))
          )}

          {tab === 'pending' && (
            pendingCount === 0
              ? <Empty label={t('noPending')} />
              : (
                <>
                  {incoming.length > 0 && (
                    <Section label={t('incoming')} count={incoming.length}>
                      {incoming.map(u => (
                        <FriendRow key={u.id} user={u} subtitle={t('wantsToBeFriend')}>
                          <IconBtn title={t('accept')} variant="success" onClick={() => run(acceptFriendRequest, { from_id: u.id })} disabled={isPending}>
                            <Check className="h-[18px] w-[18px]" />
                          </IconBtn>
                          <IconBtn title={t('decline')} variant="danger" onClick={() => run(declineFriendRequest, { from_id: u.id })} disabled={isPending}>
                            <X className="h-[18px] w-[18px]" />
                          </IconBtn>
                        </FriendRow>
                      ))}
                    </Section>
                  )}
                  {outgoing.length > 0 && (
                    <Section label={t('outgoing')} count={outgoing.length}>
                      {outgoing.map(u => (
                        <FriendRow key={u.id} user={u} subtitle={t('requestSent')}>
                          <IconBtn title={t('cancel')} variant="danger" onClick={() => run(cancelFriendRequest, { target_id: u.id, username: u.username })} disabled={isPending}>
                            <X className="h-[18px] w-[18px]" />
                          </IconBtn>
                        </FriendRow>
                      ))}
                    </Section>
                  )}
                </>
              )
          )}
        </div>
      </div>
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-white tabular-nums shadow-sm">
      {n > 99 ? '99+' : n}
    </span>
  );
}

function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="flex items-center gap-2 px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
        {label}
        {count != null && <span className="text-muted-foreground/40">— {count}</span>}
      </p>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/40">
        <Users className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <p className="text-[15px] text-muted-foreground">{label}</p>
    </div>
  );
}

function FriendRow({ user, subtitle, children }: { user: FriendUser; subtitle?: string; children: React.ReactNode }) {
  const displayName = user.display_name ?? user.username;
  const initial = displayName[0]?.toUpperCase() ?? '?';
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/30">
      <Link href={`/u/${user.username}`} className="shrink-0">
        <AvatarWithStatus status={user.status} lastSeen={user.last_seen} size={40} dotSize={9}>
          {user.avatar_url
            ? <AvatarImage src={user.avatar_url} alt={displayName} className="object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-base font-bold text-link">{initial}</span>}
        </AvatarWithStatus>
      </Link>
      <Link href={`/u/${user.username}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className={cn('truncate text-[15px] font-semibold', user.is_premium && 'aurora-text aurora-text-glow')}>{renderEmojiNodes(displayName)}</span>
          {user.is_verified && <VerifiedBadge size="sm" />}
          {user.is_moderator && <ModeratorBadge size="sm" />}
          {user.is_premium && <PremiumBadge size="sm" />}
          <DeviceBadge userId={user.id} collapse />
        </div>
        <p className="truncate text-[13px] text-muted-foreground">{subtitle ?? `@${user.username}`}</p>
      </Link>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function IconBtn({
  children, title, onClick, disabled, variant = 'default',
}: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean;
  variant?: 'default' | 'success' | 'danger';
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 transition-colors disabled:opacity-50',
        variant === 'success' && 'text-success hover:bg-success/20',
        variant === 'danger'  && 'text-muted-foreground hover:bg-destructive/20 hover:text-destructive',
        variant === 'default' && 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
