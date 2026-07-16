'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Timer, UserMinus, Ban, Crown } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { removeMember, removeTimeout } from '../actions';
import { ModActionModal, type ModAction } from './mod-modals';

export interface ModMember {
  id: string;
  username: string;
  display_name?: string | null;
  is_owner?: boolean;
  timeout_until?: string | null;
}

interface Props {
  serverId: string;
  member: ModMember;
  isOwner: boolean;
  canKick: boolean;
  canBan: boolean;
  canTimeout: boolean;
  onChanged?: () => void;
  /** Visual size of the trigger dots. */
  className?: string;
}

/**
 * A "⋮" menu of moderation actions for a member, gated by the caller's
 * permissions. Kick removes immediately; ban / timeout / transfer open a
 * confirmation dialog. Renders nothing when the caller can do nothing to the
 * target (e.g. the target is the owner, or the caller lacks every permission).
 */
export function MemberActionsMenu({ serverId, member, isOwner, canKick, canBan, canTimeout, onChanged, className }: Props) {
  const t = useT('servers');
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [action, setAction] = useState<ModAction | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const timedOut = !!member.timeout_until && new Date(member.timeout_until).getTime() > Date.now();
  // The owner can't be moderated; a caller needs at least one applicable perm.
  const showTimeout = canTimeout && !member.is_owner;
  const showKick = canKick && !member.is_owner;
  const showBan = canBan && !member.is_owner;
  const showTransfer = isOwner && !member.is_owner;
  const hasAny = showTimeout || showKick || showBan || showTransfer;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [open]);

  if (!hasAny) return null;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: Math.min(r.bottom + 4, window.innerHeight - 200), left: Math.min(r.left, window.innerWidth - 210) });
    setOpen(true);
  }

  async function doKick() {
    setOpen(false);
    await removeMember(serverId, member.id);
    window.dispatchEvent(new CustomEvent('server:changed'));
    onChanged?.();
  }

  async function doRemoveTimeout() {
    setOpen(false);
    await removeTimeout(serverId, member.id);
    window.dispatchEvent(new CustomEvent('server:changed'));
    onChanged?.();
  }

  const name = member.display_name ?? member.username;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground', className)}
        aria-label={t('memberActions')}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="surface-solid fixed z-[10001] min-w-[190px] overflow-hidden rounded-lg border border-border py-1 shadow-2xl animate-pop-in"
          style={{ top: coords.top, left: coords.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {showTimeout && (
            timedOut
              ? <MenuItem icon={<Timer className="h-4 w-4" />} label={t('removeTimeout')} onClick={doRemoveTimeout} />
              : <MenuItem icon={<Timer className="h-4 w-4" />} label={t('timeout')} onClick={() => { setOpen(false); setAction('timeout'); }} />
          )}
          {showKick && <MenuItem icon={<UserMinus className="h-4 w-4" />} label={t('kick')} danger onClick={doKick} />}
          {showBan && <MenuItem icon={<Ban className="h-4 w-4" />} label={t('ban')} danger onClick={() => { setOpen(false); setAction('ban'); }} />}
          {showTransfer && (
            <>
              <div className="my-1 h-px bg-border/60" />
              <MenuItem icon={<Crown className="h-4 w-4" />} label={t('transferOwnership')} onClick={() => { setOpen(false); setAction('transfer'); }} />
            </>
          )}
        </div>,
        document.body,
      )}

      <ModActionModal
        action={action}
        serverId={serverId}
        memberId={member.id}
        username={name}
        onClose={() => setAction(null)}
        onDone={onChanged}
      />
    </>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium transition-colors',
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent/60')}
    >
      {icon} <span className="truncate">{label}</span>
    </button>
  );
}
