'use client';

import { useState, useRef, useEffect, useTransition, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ExternalLink, Phone, Pin, PinOff, BellOff, Bell, X,
  UserPlus, UserMinus, UserCheck, Plus, Minus, Ban, ShieldOff, Copy, Users,
} from 'lucide-react';

import { cn }           from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT }         from '@/providers/i18n-provider';
import { site }         from '@/config';
import { popoutChat }   from '@/components/shell/popout-button';
import { CreateGroupModal } from '@/features/groups';
import {
  followUser, unfollowUser,
  sendFriendRequest, cancelFriendRequest,
  acceptFriendRequest, removeFriend,
  blockUser, unblockUser,
} from '@/features/social';

interface MenuUser {
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean;
}

interface Relationship {
  target_id: string;
  target_public_id: string;
  is_friend: boolean;
  req_outgoing: boolean;
  req_incoming: boolean;
  is_following: boolean;
  is_blocked: boolean;
  blocked_by: boolean;
}

interface UserContextMenuProps {
  user: MenuUser;
  conversationId?: string;
  /** Route to pop out into a separate window (e.g. `/messages/{publicId}`). */
  popoutPath?: string;
  pinned?: boolean;
  muted?: boolean;
  onCloseDm?: () => void;
  onCall?: () => void;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  className?: string;
  /** When true the menu also opens on a normal left-click of the trigger. */
  openOnClick?: boolean;
  children: React.ReactNode;
}

const MENU_W = 220;

/**
 * Discord-style context menu opened by right-clicking a user avatar inside DMs.
 * Relationship state (friend / follow / block) is resolved on open.
 */
export function UserContextMenu({
  user, conversationId, popoutPath, pinned, muted,
  onCloseDm, onCall, onTogglePin, onToggleMute,
  className, openOnClick, children,
}: UserContextMenuProps) {
  const t  = useT('userMenu');
  const tn = useT('nav');
  const router = useRouter();
  const [open,   setOpen]   = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [rel,    setRel]    = useState<Relationship | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchRel = useCallback(async () => {
    const sb = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).rpc('get_user_relationship', { target_username: user.username });
    if (data?.[0]) setRel(data[0] as Relationship);
  }, [user.username]);

  function openAt(clientX: number, clientY: number) {
    const W = MENU_W, H = 360;
    let left = clientX;
    let top  = clientY;
    if (left + W > window.innerWidth - 8)  left = window.innerWidth - W - 8;
    if (top + H > window.innerHeight - 8)  top  = Math.max(8, window.innerHeight - H - 8);
    setCoords({ top: top + window.scrollY, left: left + window.scrollX });
    setRel(null);
    setOpen(true);
    fetchRel();
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    openAt(e.clientX, e.clientY);
  }

  function handleClick(e: React.MouseEvent) {
    if (!openOnClick) return;
    e.preventDefault();
    e.stopPropagation();
    // The wrapper uses `display:contents` (zero-size box), so anchor to the
    // actual rendered child element; fall back to the cursor position.
    const child = (e.currentTarget as HTMLElement).firstElementChild as HTMLElement | null;
    const rect = child?.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) openAt(rect.left, rect.bottom + 4);
    else openAt(e.clientX, e.clientY);
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() { setOpen(false); }

  function runAction(action: (fd: FormData) => Promise<unknown>, extra?: Record<string, string>) {
    if (!rel) return;
    const fd = new FormData();
    fd.append('target_id', rel.target_id);
    fd.append('username', user.username);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    startTransition(async () => {
      await action(fd);
      await fetchRel();
      router.refresh();
      window.dispatchEvent(new CustomEvent('prosto:relationship', { detail: { username: user.username } }));
    });
  }

  function copyId() {
    if (rel) navigator.clipboard.writeText(rel.target_public_id).catch(() => {});
    close();
  }

  return (
    <>
      <span onContextMenu={handleContextMenu} onClick={handleClick} className={cn('contents', className)}>
        {children}
      </span>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          // Stop mousedown from bubbling to document — otherwise a parent popup
          // (e.g. MiniProfilePopup) that closes on outside-mousedown would tear
          // this menu down before the click lands, so "View profile" did nothing.
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: coords.top, left: coords.left, width: MENU_W, zIndex: 9999 }}
          className="surface-solid overflow-hidden rounded-lg border border-border py-1 shadow-xl animate-pop-in"
        >
          <Item icon={<ExternalLink className="h-4 w-4" />} label={t('profile')}
            onClick={() => { close(); router.push(site.routes.profile(user.username)); }} />

          {popoutPath && (
            <Item icon={<ExternalLink className="h-4 w-4" />} label={tn('popOut')}
              onClick={() => { close(); popoutChat(popoutPath); }} />
          )}

          {(onCall || (conversationId && (onTogglePin || onToggleMute)) || onCloseDm) && <Divider />}

          {onCall && (
            <Item icon={<Phone className="h-4 w-4" />} label={t('call')}
              onClick={() => { close(); onCall(); }} />
          )}
          {conversationId && onTogglePin && (
            <Item icon={pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              label={pinned ? t('unpin') : t('pin')}
              onClick={() => { close(); onTogglePin(); }} />
          )}
          {conversationId && onToggleMute && (
            <Item icon={muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              label={muted ? t('unmute') : t('mute')}
              onClick={() => { close(); onToggleMute(); }} />
          )}
          {onCloseDm && (
            <Item icon={<X className="h-4 w-4" />} label={t('closeDm')}
              onClick={() => { close(); onCloseDm(); }} />
          )}

          <Divider />

          {!rel ? (
            <div className="px-3 py-2 text-[13px] text-muted-foreground/50">{t('loading')}</div>
          ) : (
            <>
              {!rel.is_blocked && !rel.blocked_by && (
                <>
                  {/* Friend */}
                  {rel.is_friend ? (
                    <Item icon={<UserMinus className="h-4 w-4" />} label={t('removeFriend')}
                      onClick={() => runAction(removeFriend, { other_id: rel.target_id })} />
                  ) : rel.req_incoming ? (
                    <Item icon={<UserCheck className="h-4 w-4" />} label={t('acceptFriend')}
                      onClick={() => runAction(acceptFriendRequest, { from_id: rel.target_id })} />
                  ) : rel.req_outgoing ? (
                    <Item icon={<UserMinus className="h-4 w-4" />} label={t('cancelRequest')}
                      onClick={() => runAction(cancelFriendRequest)} />
                  ) : (
                    <Item icon={<UserPlus className="h-4 w-4" />} label={t('addFriend')}
                      onClick={() => runAction(sendFriendRequest)} />
                  )}

                  {/* Follow */}
                  {rel.is_following ? (
                    <Item icon={<Minus className="h-4 w-4" />} label={t('unfollow')}
                      onClick={() => runAction(unfollowUser)} />
                  ) : (
                    <Item icon={<Plus className="h-4 w-4" />} label={t('follow')}
                      onClick={() => runAction(followUser)} />
                  )}

                  <Divider />
                </>
              )}

              {/* Block */}
              {rel.is_blocked ? (
                <Item icon={<ShieldOff className="h-4 w-4" />} label={t('unblock')}
                  onClick={() => runAction(unblockUser)} />
              ) : (
                <Item icon={<Ban className="h-4 w-4" />} label={t('block')} danger
                  onClick={() => runAction(blockUser)} />
              )}
            </>
          )}

          <Divider />
          <Item icon={<Copy className="h-4 w-4" />} label={t('copyId')} onClick={copyId} />
          {rel && (
            <Item icon={<Users className="h-4 w-4" />} label={t('createGroup')}
              onClick={() => { close(); setGroupOpen(true); }} />
          )}
        </div>,
        document.body,
      )}

      {groupOpen && rel && (
        <CreateGroupModal preselect={[rel.target_id]} onClose={() => setGroupOpen(false)} />
      )}
    </>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-border/60" />;
}

function Item({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] font-medium transition-colors',
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent',
      )}
    >
      <span>{label}</span>
      <span className={danger ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
    </button>
  );
}
