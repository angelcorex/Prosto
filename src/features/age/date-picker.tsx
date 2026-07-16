'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ArrowLeft, ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';

/**
 * Custom (non-native) date picker — a self-styled calendar instead of the
 * browser's `<input type="date">`. Built for birth dates: quick month/year
 * navigation (and a year grid to jump decades), min/max clamping, and an
 * optional hidden input so it submits inside a form under `name`.
 *
 * Value format is `yyyy-mm-dd` (same as a date input), so callers/servers stay
 * unchanged.
 */

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
function toYMD(y: number, m: number, d: number): string { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function daysInMonth(y: number, m: number): number { return new Date(y, m + 1, 0).getDate(); }
/** Mon=0 … Sun=6 for a given first-of-month. */
function mondayFirstOffset(y: number, m: number): number { return (new Date(y, m, 1).getDay() + 6) % 7; }

function parseYMD(v: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

export function DatePicker({
  value,
  onChange,
  max,
  min,
  name,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string) => void;
  /** Latest selectable date (`yyyy-mm-dd`). */
  max?: string;
  /** Earliest selectable date (`yyyy-mm-dd`). */
  min?: string;
  /** When set, a hidden input carries the value so the picker works in a form. */
  name?: string;
  placeholder?: string;
}) {
  const t = useT('age');
  // App locale is mirrored on <html lang> by the root layout.
  const locale = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'years'>('days');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = parseYMD(value);
  const maxD = parseYMD(max);
  const minD = parseYMD(min);

  // The month currently shown (defaults to the selected date, else max, else today).
  const initial = selected ?? maxD ?? { y: new Date().getFullYear(), m: new Date().getMonth(), d: 1 };
  const [viewY, setViewY] = useState(initial.y);
  const [viewM, setViewM] = useState(initial.m);

  // Re-centre the view when the value changes externally.
  useEffect(() => {
    const s = parseYMD(value);
    if (s) { setViewY(s.y); setViewM(s.m); }
  }, [value]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setMode('days'); }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2020, m, 1))),
    [locale],
  );
  const weekdayNames = useMemo(() => {
    // Monday-first short weekday labels.
    const base = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)));
  }, [locale]);

  const maxYear = maxD?.y ?? new Date().getFullYear();
  const minYear = minD?.y ?? maxYear - 120;

  function isDisabled(y: number, m: number, d: number): boolean {
    const t0 = new Date(y, m, d).getTime();
    if (maxD && t0 > new Date(maxD.y, maxD.m, maxD.d).getTime()) return true;
    if (minD && t0 < new Date(minD.y, minD.m, minD.d).getTime()) return true;
    return false;
  }

  function prevMonth() { setViewM((m) => (m === 0 ? (setViewY((y) => y - 1), 11) : m - 1)); }
  function nextMonth() { setViewM((m) => (m === 11 ? (setViewY((y) => y + 1), 0) : m + 1)); }

  function pick(d: number) {
    if (isDisabled(viewY, viewM, d)) return;
    onChange(toYMD(viewY, viewM, d));
    setOpen(false);
    setMode('days');
  }

  const offset = mondayFirstOffset(viewY, viewM);
  const total = daysInMonth(viewY, viewM);
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  const label = selected
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(selected.y, selected.m, selected.d))
    : (placeholder ?? t('birthDateLabel'));

  return (
    <div ref={wrapRef} className="relative">
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setMode('days'); }}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border border-border/50 bg-background px-3 py-2.5 text-left text-[14px] outline-none transition-colors focus:border-link',
          selected ? 'text-foreground' : 'text-muted-foreground/60',
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="surface-solid absolute left-0 z-[120] mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border/50 p-3 shadow-2xl">
          {/* Header: month nav + year toggle */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={prevMonth} aria-label="Previous month" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMode((m) => (m === 'years' ? 'days' : 'years'))}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[14px] font-semibold text-foreground transition-colors hover:bg-accent"
            >
              {monthNames[viewM]} {viewY}
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', mode === 'years' && 'rotate-180')} />
            </button>
            <button type="button" onClick={nextMonth} aria-label="Next month" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {mode === 'years' ? (
            <div className="grid max-h-[220px] grid-cols-4 gap-1 overflow-y-auto">
              {Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i).map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => { setViewY(y); setMode('days'); }}
                  className={cn(
                    'rounded-lg py-1.5 text-[13px] font-medium transition-colors',
                    y === viewY ? 'bg-link text-white' : 'text-foreground hover:bg-accent',
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-1 grid grid-cols-7 gap-1">
                {weekdayNames.map((w, i) => (
                  <span key={i} className="py-1 text-center text-[11px] font-semibold uppercase text-muted-foreground/50">{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  if (d == null) return <span key={`e${i}`} />;
                  const isSel = !!selected && selected.y === viewY && selected.m === viewM && selected.d === d;
                  const disabled = isDisabled(viewY, viewM, d);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(d)}
                      className={cn(
                        'flex h-8 items-center justify-center rounded-lg text-[13px] transition-colors',
                        disabled ? 'cursor-not-allowed text-muted-foreground/25'
                          : isSel ? 'bg-link font-semibold text-white'
                          : 'text-foreground hover:bg-accent',
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

