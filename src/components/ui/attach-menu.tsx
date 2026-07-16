'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

export interface AttachMenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

/**
 * Composer attachment button — a round "+" that opens a small popup menu
 * (Discord-style) above it, instead of firing an action immediately. Reused by
 * the DM and channel composers.
 */
export function AttachMenu({
  items,
  disabled,
  loading,
  title,
}: {
  items: AttachMenuItem[];
  disabled?: boolean;
  /** Show a spinner in place of the "+" (e.g. while an upload is in flight). */
  loading?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground transition-colors hover:bg-muted-foreground/30 hover:text-foreground disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
        ) : (
          <Plus className={cn('h-[18px] w-[18px] transition-transform duration-fast', open && 'rotate-45')} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="surface-solid absolute bottom-full left-0 z-popover mb-2 min-w-[224px] overflow-hidden rounded-2xl border border-border p-1.5 shadow-lg animate-pop-in"
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
                {it.icon}
              </span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
