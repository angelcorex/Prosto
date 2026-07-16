'use client';

import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

/**
 * Collapses a row of small badges behind a single trigger once there are two or
 * more, so a name row stays tidy for users with several badges (verified +
 * moderator + premium, or multiple online devices). A single badge renders
 * inline; an empty list renders nothing.
 *
 * The trigger shows a "…" with the count and opens a small popover listing all
 * the badges (each keeps its own tooltip/popover). Falsy children (from
 * conditionals like `isVerified && <…/>`) are dropped by `Children.toArray`, so
 * the count reflects only the badges actually present. The popover is rendered
 * through a portal so an `overflow: hidden`/`truncate` name row can't clip it.
 */
export function BadgeCluster({ children, className }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Open on hover; a short close delay lets the pointer cross the small gap
  // between the trigger and the (portaled) popover without it snapping shut.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function openNow() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const w = popRef.current?.offsetWidth ?? 0;
    const h = popRef.current?.offsetHeight ?? 0;
    let top = r.top - h - 6; // above the trigger
    if (top < 8) top = r.bottom + 6; // flip below when there's no room above
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  if (items.length === 1) {
    return <span className={cn('inline-flex shrink-0 items-center', className)}>{items[0]}</span>;
  }

  return (
    <>
      {/* A <span role="button"> (not a real <button>) so it can safely live
          inside another button, e.g. the profile panel trigger — nested
          <button>s are invalid HTML and break hydration. */}
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onFocus={openNow}
        onBlur={scheduleClose}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((v) => !v); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
        aria-expanded={open}
        className={cn(
          'inline-flex h-[18px] shrink-0 cursor-pointer items-center gap-0.5 rounded-full px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          open && 'bg-accent text-foreground',
          className,
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold leading-none tabular-nums">{items.length}</span>
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          style={{
            position: 'absolute',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            zIndex: 9999,
            visibility: pos ? 'visible' : 'hidden',
          }}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 shadow-2xl animate-fade-in"
        >
          {items.map((it, i) => (
            <span key={i} className="inline-flex items-center">
              {it}
            </span>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
