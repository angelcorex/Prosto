'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

import { cn }            from '@/lib/utils/cn';
import { ProfilePopup }  from '@/components/shell/profile-popup';
import type { ProfilePopupUser } from '@/components/shell/profile-popup';

export type { ProfilePopupUser };

interface MiniProfilePopupProps {
  user: ProfilePopupUser;
  children: React.ReactNode;
  className?: string;
  /** When opened from a server context, enables the roles section + assignment. */
  serverId?: string;
  memberId?: string;
}

/**
 * Wraps any content. On click opens the shared ProfilePopup.
 */
export function MiniProfilePopup({ user, children, className, serverId, memberId }: MiniProfilePopupProps) {
  const [open,   setOpen]   = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  // Hidden until positioned so it never flashes at the top-left corner (0,0)
  // for a frame before the layout effect places it.
  const [placed, setPlaced] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);

  // Track viewport so the popup becomes a bottom sheet on phones
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const position = useCallback(() => {
    if (isMobile || !triggerRef.current) return;
    const rect   = triggerRef.current.getBoundingClientRect();
    const popupW = 280;
    const popupH = popupRef.current?.offsetHeight || 360;
    const margin = 8;

    // Horizontal: prefer the right side, flip left if it won't fit.
    let left = rect.right + 10;
    if (left + popupW > window.innerWidth - margin) left = rect.left - popupW - 10;
    if (left < margin) left = margin;

    // Vertical: open downward, but if it would overflow the bottom, shift up so
    // the whole card stays on screen (open upward).
    let top = rect.top;
    if (top + popupH > window.innerHeight - margin) top = window.innerHeight - margin - popupH;
    if (top < margin) top = margin;

    setCoords({ top: top + window.scrollY, left: left + window.scrollX });
    setPlaced(true);
  }, [isMobile]);

  // Reset the "placed" gate whenever the popup closes so the next open
  // positions before painting again.
  useEffect(() => { if (!open) setPlaced(false); }, [open]);

  // Position BEFORE paint (useLayoutEffect) so the card appears at its final
  // spot — no flash from the top-left corner. Re-position when it resizes
  // (skeleton → full content) or the window changes.
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    position();
    const node = popupRef.current;
    const ro = node ? new ResizeObserver(position) : null;
    if (node && ro) ro.observe(node);
    window.addEventListener('resize', position);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', position);
    };
  }, [open, isMobile, position]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn('cursor-pointer focus:outline-none', className)}
      >
        {children}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        isMobile ? (
          /* ── Mobile: bottom sheet sliding up ── */
          <div
            className="fixed inset-0 z-[9999] flex items-end bg-black/50 animate-fade-in"
            onClick={() => setOpen(false)}
          >
            <div
              ref={popupRef}
              onClick={e => e.stopPropagation()}
              className="w-full animate-slide-up pb-[env(safe-area-inset-bottom)] [&>div]:rounded-b-none"
            >
              <ProfilePopup user={user} serverId={serverId} memberId={memberId} onClose={() => setOpen(false)} />
            </div>
          </div>
        ) : (
          /* ── Desktop: anchored card ── */
          <div
            ref={popupRef}
            style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999, visibility: placed ? 'visible' : 'hidden' }}
            className={cn('w-[280px]', placed && 'animate-pop-in')}
          >
            <ProfilePopup user={user} serverId={serverId} memberId={memberId} onClose={() => setOpen(false)} />
          </div>
        ),
        document.body,
      )}
    </>
  );
}
