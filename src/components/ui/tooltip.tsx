'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils/cn';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  /** Extra classes for the floating bubble. */
  className?: string;
}

/**
 * Lightweight hover/focus tooltip rendered in a portal. Auto-flips and clamps
 * to stay fully on screen (e.g. badges near the top edge).
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [hoverable, setHoverable] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Only enable hover tooltips on devices with a real pointer. On touch the
  // mouseenter handler makes the first tap "hover" and the second "click"
  // (the classic iOS double-tap), so we skip it entirely there.
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setHoverable(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const r = ref.current.getBoundingClientRect();
    const b = bubbleRef.current?.getBoundingClientRect();
    const bw = b?.width ?? 180;
    const bh = b?.height ?? 40;
    const gap = 8, margin = 6;
    const vw = window.innerWidth, vh = window.innerHeight;

    let s = side;
    if (s === 'top' && r.top - bh - gap < margin) s = 'bottom';
    else if (s === 'bottom' && r.bottom + bh + gap > vh - margin) s = 'top';
    else if (s === 'left' && r.left - bw - gap < margin) s = 'right';
    else if (s === 'right' && r.right + bw + gap > vw - margin) s = 'left';

    let top: number, left: number;
    if (s === 'top')         { top = r.top - bh - gap;  left = r.left + r.width / 2 - bw / 2; }
    else if (s === 'bottom') { top = r.bottom + gap;    left = r.left + r.width / 2 - bw / 2; }
    else if (s === 'right')  { left = r.right + gap;    top = r.top + r.height / 2 - bh / 2; }
    else                     { left = r.left - bw - gap; top = r.top + r.height / 2 - bh / 2; }

    left = Math.max(margin, Math.min(left, vw - bw - margin));
    top = Math.max(margin, Math.min(top, vh - bh - margin));
    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, [open, side]);

  if (!hoverable) return <span className="inline-flex">{children}</span>;

  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && content !== null && content !== undefined && typeof document !== 'undefined' && createPortal(
        <div
          ref={bubbleRef}
          role="tooltip"
          style={{ position: 'absolute', top: pos?.top ?? -9999, left: pos?.left ?? -9999, zIndex: 9999, opacity: pos ? 1 : 0 }}
          className={cn(
            'surface-solid pointer-events-none max-w-[260px] rounded-xl px-3 py-2 text-[13px] font-semibold text-foreground shadow-xl ring-1 ring-border/50 animate-fade-in',
            className,
          )}
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}
