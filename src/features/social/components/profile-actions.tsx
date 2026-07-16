'use client';

import { useState, useTransition } from 'react';
import { UserPlus, UserCheck, UserMinus, Bell, BellOff, MessageCircle, Check, X, MoreHorizontal } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';
import { buttonClass, UserContextMenu } from '@/components/ui';
import {
  followUser, unfollowUser,
  sendFriendRequest, cancelFriendRequest,
  acceptFriendRequest, declineFriendRequest, removeFriend,
  openConversation,
} from '../api/actions';

interface ProfileActionsProps {
  targetId:     string;
  targetUsername: string;
  isFollowing:  boolean;
  friendStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
  isBlocked:    boolean;
  blockedBy:    boolean;
}

export function ProfileActions({
  targetId,
  targetUsername,
  isFollowing,
  friendStatus,
  isBlocked,
  blockedBy,
}: ProfileActionsProps) {
  const t = useT('social');
  const [, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const blocked = isBlocked || blockedBy;

  /** Adapt a value-returning server action to a void form action. */
  const submit =
    (fn: (fd: FormData) => Promise<unknown>) =>
    (fd: FormData) =>
      startTransition(() => void fn(fd));

  /** Friend request: surface a privacy/block refusal instead of failing silently. */
  const submitFriendRequest = (fd: FormData) =>
    startTransition(async () => {
      setNotice(null);
      const res = (await sendFriendRequest(fd)) as { error?: string } | undefined;
      if (res?.error === 'not_allowed') setNotice(t('notAcceptingFriends'));
      else if (res?.error === 'blocked') setNotice(t('actionBlocked'));
      else if (res?.error) setNotice(t('actionBlocked'));
    });

  // On mobile the primary actions become a full-width labelled bar (each button
  // grows to fill its share); on sm+ they collapse to the compact right-aligned
  // cluster that sits on the avatar row. `btn` centres content and, on mobile,
  // gives a 40px tap height + flex-1 growth.
  const btn = (variant: 'primary' | 'outline' | 'ghost') =>
    `${buttonClass({ variant, size: 'sm' })} h-10 flex-1 justify-center sm:h-9 sm:flex-none`;

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">

      {!blocked && (
        <>
          {/* ── Friend request button ── */}
          {friendStatus === 'none' && (
            <form action={submitFriendRequest} className="flex flex-1 sm:flex-none">
              <input type="hidden" name="target_id" value={targetId} />
              <input type="hidden" name="username"  value={targetUsername} />
              <button type="submit" className={btn('primary')}>
                <UserPlus className="h-4 w-4" />
                {t('addFriend')}
              </button>
            </form>
          )}

          {friendStatus === 'pending_sent' && (
            <form action={submit(cancelFriendRequest)} className="flex flex-1 sm:flex-none">
              <input type="hidden" name="target_id" value={targetId} />
              <input type="hidden" name="username"  value={targetUsername} />
              <button type="submit" className={btn('outline')}>
                <UserMinus className="h-4 w-4" />
                {t('cancelRequest')}
              </button>
            </form>
          )}

          {friendStatus === 'pending_received' && (
            <>
              <form action={submit(acceptFriendRequest)} className="flex flex-1 sm:flex-none">
                <input type="hidden" name="from_id" value={targetId} />
                <button type="submit" className={btn('primary')}>
                  <Check className="h-4 w-4" />
                  {t('accept')}
                </button>
              </form>
              <form action={submit(declineFriendRequest)} className="flex flex-1 sm:flex-none">
                <input type="hidden" name="from_id" value={targetId} />
                <button type="submit" className={btn('outline')}>
                  <X className="h-4 w-4" />
                  {t('decline')}
                </button>
              </form>
            </>
          )}

          {friendStatus === 'accepted' && (
            <form action={submit(removeFriend)} className="flex flex-1 sm:flex-none">
              <input type="hidden" name="other_id" value={targetId} />
              <button type="submit" className={btn('outline')}>
                <UserCheck className="h-4 w-4" />
                {t('friends')}
              </button>
            </form>
          )}

          {/* ── Follow button ── */}
          {isFollowing ? (
            <form action={submit(unfollowUser)} className="flex flex-1 sm:flex-none">
              <input type="hidden" name="target_id" value={targetId} />
              <input type="hidden" name="username"  value={targetUsername} />
              <button type="submit" className={btn('outline')}>
                <BellOff className="h-4 w-4" />
                {t('unfollow')}
              </button>
            </form>
          ) : (
            <form action={submit(followUser)} className="flex flex-1 sm:flex-none">
              <input type="hidden" name="target_id" value={targetId} />
              <input type="hidden" name="username"  value={targetUsername} />
              <button type="submit" className={btn('outline')}>
                <Bell className="h-4 w-4" />
                {t('follow')}
              </button>
            </form>
          )}

          {/* ── Message button ── */}
          <form action={submit(openConversation)} className="flex flex-1 sm:flex-none">
            <input type="hidden" name="target_id" value={targetId} />
            <button type="submit" className={btn('ghost')}>
              <MessageCircle className="h-4 w-4" />
              {t('message')}
            </button>
          </form>
        </>
      )}

      {/* ── More menu (always visible) — icon-only, fixed size ── */}
      <UserContextMenu user={{ username: targetUsername }}>
        <button type="button" className={`${buttonClass({ variant: 'ghost', size: 'sm' })} h-10 w-10 shrink-0 justify-center px-0 sm:h-9 sm:w-9`}>
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </UserContextMenu>

    </div>
      {notice && (
        <p className="text-[12px] text-muted-foreground sm:text-right">{notice}</p>
      )}
    </div>
  );
}
