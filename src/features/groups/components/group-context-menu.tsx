'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Pencil, UserPlus, LogOut, Trash2 } from 'lucide-react';

import { cn }           from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT }         from '@/providers/i18n-provider';
import { EditGroupModal } from './edit-group-modal';
import { CreateGroupModal } from './create-group-modal';

interface GroupMenuTarget {
  conversationId: string;
  publicId: string;
  name: string | null;
  avatar: string | null;
}

interface GroupContextMenuProps {
  group: GroupMenuTarget;
  /** Also open on a normal left-click of the trigger. */
  openOnClick?: boolean;
  className?: string;
  children: React.ReactNode;
}

const MENU_W = 220;

export function GroupContextMenu({ group, openOnClick, className, children }: GroupContextMenuProps) {
  const t = useT('messages');
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [isOwner, setIsOwner] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function resolveOwner() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).rpc('get_group', { gpid: group.publicId });
    const g = Array.isArray(data) ? data[0] : data;
    setIsOwner(!!user && !!g && g.owner_id === user.id);
  }

  function openAt(clientX: number, clientY: number) {
    const W = MENU_W, H = 200;
    let left = clientX, top = clientY;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    if (top + H > window.innerHeight - 8) top = Math.max(8, window.innerHeight - H - 8);
    setCoords({ top: top + window.scrollY, left: left + window.scrollX });
    setOpen(true);
    resolveOwner();
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    openAt(e.clientX, e.clientY);
  }
  function handleClick(e: React.MouseEvent) {
    if (!openOnClick) return;
    e.preventDefault(); e.stopPropagation();
    const child = (e.currentTarget as HTMLElement).firstElementChild as HTMLElement | null;
    const rect = child?.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) openAt(rect.left, rect.bottom + 4);
    else openAt(e.clientX, e.clientY);
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function leave() {
    setOpen(false);
    const sb = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).rpc('leave_group', { conv: group.conversationId });
    router.push('/messages');
    router.refresh();
  }

  async function remove() {
    setOpen(false);
    const sb = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).rpc('delete_group', { conv: group.conversationId });
    router.push('/messages');
    router.refresh();
  }

  return (
    <>
      <span onContextMenu={handleContextMenu} onClick={handleClick} className={cn('contents', className)}>
        {children}
      </span>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'absolute', top: coords.top, left: coords.left, width: MENU_W, zIndex: 9999 }}
          className="surface-solid overflow-hidden rounded-lg border border-border py-1 shadow-xl animate-fade-in"
        >
          <Item icon={<Pencil className="h-4 w-4" />} label={t('editGroup')}
            onClick={() => { setOpen(false); setEditOpen(true); }} />
          <Item icon={<UserPlus className="h-4 w-4" />} label={t('inviteToGroup')}
            onClick={() => { setOpen(false); setInviteOpen(true); }} />
          <Divider />
          <Item icon={<LogOut className="h-4 w-4" />} label={t('leaveGroup')} danger onClick={leave} />
          {isOwner && (
            <Item icon={<Trash2 className="h-4 w-4" />} label={t('deleteGroup')} danger onClick={remove} />
          )}
        </div>,
        document.body,
      )}

      {editOpen && (
        <EditGroupModal
          conversationId={group.conversationId}
          currentName={group.name}
          currentAvatar={group.avatar}
          onClose={() => setEditOpen(false)}
        />
      )}
      {inviteOpen && (
        <CreateGroupModal addToGroup={group.conversationId} onClose={() => setInviteOpen(false)} />
      )}
    </>
  );
}

function Divider() { return <div className="my-1 h-px bg-border/60" />; }

function Item({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-3 py-2 text-[13px] font-medium transition-colors',
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent',
      )}
    >
      <span>{label}</span>
      <span className={danger ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
    </button>
  );
}
