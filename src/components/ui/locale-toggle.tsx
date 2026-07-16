'use client';

import { useRef, useState, useTransition, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils/cn';

/* ── Inline SVG flag icons ─────────────────────────────────────────────── */

function FlagRU({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" xmlns="http://www.w3.org/2000/svg" className={cn('h-4 w-5 rounded-sm', className)}>
      <rect width="20" height="14" rx="2" fill="#fff" />
      <rect y="4.667" width="20" height="4.666" fill="#0039A6" />
      <rect y="9.333" width="20" height="4.667" fill="#D52B1E" />
    </svg>
  );
}

function FlagEN({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" xmlns="http://www.w3.org/2000/svg" className={cn('h-4 w-5 rounded-sm', className)}>
      <rect width="20" height="14" rx="2" fill="#012169" />
      {/* White diagonals */}
      <line x1="0" y1="0"  x2="20" y2="14" stroke="#fff" strokeWidth="2.8" />
      <line x1="20" y1="0" x2="0"  y2="14" stroke="#fff" strokeWidth="2.8" />
      {/* Red diagonals */}
      <line x1="0" y1="0"  x2="20" y2="14" stroke="#C8102E" strokeWidth="1.6" />
      <line x1="20" y1="0" x2="0"  y2="14" stroke="#C8102E" strokeWidth="1.6" />
      {/* White cross */}
      <rect x="8" y="0"  width="4" height="14" fill="#fff" />
      <rect x="0" y="5"  width="20" height="4" fill="#fff" />
      {/* Red cross */}
      <rect x="8.8" y="0"  width="2.4" height="14" fill="#C8102E" />
      <rect x="0"   y="5.8" width="20" height="2.4" fill="#C8102E" />
    </svg>
  );
}

/* ── Locale config ─────────────────────────────────────────────────────── */

type LocaleOption = {
  code: string;
  label: string;
  Flag: React.FC<{ className?: string }>;
};

const LOCALES: LocaleOption[] = [
  { code: 'en', label: 'English',  Flag: FlagEN },
  { code: 'ru', label: 'Русский', Flag: FlagRU },
];

/* ── Component ─────────────────────────────────────────────────────────── */

export function LocaleToggle({ locale, up = false, alignLeft = false }: { locale: string; up?: boolean; alignLeft?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]!;
  const CurrentFlag = current.Flag;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(code: string) {
    setOpen(false);
    if (code === locale) return;
    document.cookie = `locale=${code};path=/;max-age=31536000;SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Select language"
        aria-expanded={open}
        className={cn(
          'flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3',
          'text-sm text-foreground transition-colors duration-fast',
          'hover:bg-accent',
          open && 'bg-accent',
        )}
      >
        <CurrentFlag />
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          'surface-solid absolute z-dropdown min-w-40 overflow-hidden rounded-xl border border-border shadow-md',
          up ? 'bottom-12' : 'top-12',
          alignLeft ? 'left-0' : 'right-0',
        )}>
          {LOCALES.map(({ code, label, Flag }) => (
            <button
              key={code}
              onClick={() => select(code)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors duration-fast',
                'hover:bg-accent',
                code === locale ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <Flag />
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
