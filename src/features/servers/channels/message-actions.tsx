'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Reply, CornerUpRight, Copy, Trash2, MoreHorizontal, Pencil, Smile, Pin, Hash } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { EmojiPicker } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';

// ── ActionItem ────────────────────────────────────────────────────────────────

export function ActionItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
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

// ── MessageActions ─────────────────────────────────────────────────────────────

interface MessageActionsProps {
  canDelete: boolean;
  canEdit: boolean;
  canReact: boolean;
  canPin: boolean;
  isPinned: boolean;
  serverId?: string;
  /** Touch: parent row tapped → reveal the toolbar (no hover on touch). */
  forceOpen?: boolean;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onCopyId: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
}

export function MessageActions({
  canDelete,
  canEdit,
  canReact,
  canPin,
  isPinned,
  serverId,
  forceOpen = false,
  onReply,
  onForward,
  onCopy,
  onCopyId,
  onEdit,
  onPin,
  onDelete,
  onReact,
}: MessageActionsProps) {
  const tm = useT('messages');
  const tr = useT('reactions');
  const [menuOpen, setMenuOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position BEFORE paint so the menu never flashes at the corner (0,0) first.
  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const W = 180;
    const H = 180;
    let left = rect.right - W + window.scrollX;
    if (left < 8) left = 8;
    let top = rect.bottom + 4 + window.scrollY;
    if (rect.bottom + H + 4 > window.innerHeight)
      top = Math.max(window.scrollY + 8, rect.top - H - 4 + window.scrollY);
    setCoords({ top, left });
    setReady(true);
  }, [menuOpen]);

  // Reset the placement gate on close so the next open re-positions first.
  useEffect(() => { if (!menuOpen) setReady(false); }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      )
        setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div
      className={cn(
        'surface-solid absolute right-3 top-0.5 z-30 items-center gap-0.5 rounded-lg border border-border p-0.5 shadow-md',
        (menuOpen || forceOpen) ? 'flex' : 'hidden group-hover:flex',
      )}
    >
      {canReact && (
        <EmojiPicker
          onSelect={onReact}
          serverId={serverId}
          title={tr('add')}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8"
        >
          <Smile className="h-4 w-4" />
        </EmojiPicker>
      )}
      <button
        type="button"
        onClick={onReply}
        title={tm('reply')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8"
      >
        <Reply className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onForward}
        title={tm('forward')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8"
      >
        <CornerUpRight className="h-4 w-4" />
      </button>
      {/* Quick access: edit (own) + pin (with permission) — no menu dive. */}
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          title={tm('edit')}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {canPin && (
        <button
          type="button"
          onClick={onPin}
          title={isPinned ? tm('unpin') : tm('pin')}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8',
            isPinned ? 'text-link' : 'text-muted-foreground',
          )}
        >
          <Pin className="h-4 w-4" />
        </button>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        title={tm('more')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999, visibility: ready ? 'visible' : 'hidden' }}
            className="surface-solid w-44 overflow-hidden rounded-lg border border-border py-1 shadow-xl animate-pop-in"
          >
            <ActionItem
              icon={<Reply className="h-4 w-4" />}
              label={tm('reply')}
              onClick={() => { setMenuOpen(false); onReply(); }}
            />
            <ActionItem
              icon={<CornerUpRight className="h-4 w-4" />}
              label={tm('forward')}
              onClick={() => { setMenuOpen(false); onForward(); }}
            />
            <ActionItem
              icon={<Copy className="h-4 w-4" />}
              label={tm('copyText')}
              onClick={() => { setMenuOpen(false); onCopy(); }}
            />
            <ActionItem
              icon={<Hash className="h-4 w-4" />}
              label={tm('copyId')}
              onClick={() => { setMenuOpen(false); onCopyId(); }}
            />
            {canPin && (
              <ActionItem
                icon={<Pin className="h-4 w-4" />}
                label={isPinned ? tm('unpin') : tm('pin')}
                onClick={() => { setMenuOpen(false); onPin(); }}
              />
            )}
            {canEdit && (
              <ActionItem
                icon={<Pencil className="h-4 w-4" />}
                label={tm('edit')}
                onClick={() => { setMenuOpen(false); onEdit(); }}
              />
            )}
            {canDelete && (
              <>
                <div className="my-1 h-px bg-border/60" />
                <ActionItem
                  icon={<Trash2 className="h-4 w-4" />}
                  label={tm('delete')}
                  danger
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                />
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
