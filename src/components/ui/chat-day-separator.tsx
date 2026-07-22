'use client';

import { useEffect, useState } from 'react';

const MS_PER_DAY = 86_400_000;
const SSR_TIME_ZONE = 'UTC';

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

const calendarFormatters = new Map<string, Intl.DateTimeFormat>();

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarParts(date: Date, timeZone: string): CalendarParts | null {
  let formatter = calendarFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    calendarFormatters.set(timeZone, formatter);
  }

  const values = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(values.get('year'));
  const month = Number(values.get('month'));
  const day = Number(values.get('day'));
  return year && month && day ? { year, month, day } : null;
}

function dayIndex(parts: CalendarParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY;
}

function dateKey(parts: CalendarParts): string {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

/**
 * Returns null during SSR and the first hydration render so date grouping is
 * structurally stable, then switches to the browser's calendar timezone.
 */
export function useViewerTimeZone(): string | null {
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || SSR_TIME_ZONE);
    } catch {
      setTimeZone(SSR_TIME_ZONE);
    }
  }, []);

  return timeZone;
}

/** Compare timestamps by the viewer's calendar day, not by UTC date. */
export function isSameCalendarDay(a: string, b: string, timeZone: string | null): boolean {
  const first = parseDate(a);
  const second = parseDate(b);
  if (!first || !second) return false;

  const effectiveTimeZone = timeZone ?? SSR_TIME_ZONE;
  const firstParts = calendarParts(first, effectiveTimeZone);
  const secondParts = calendarParts(second, effectiveTimeZone);
  return !!firstParts && !!secondParts && dayIndex(firstParts) === dayIndex(secondParts);
}

interface ChatDaySeparatorProps {
  date: string;
  locale: string;
  timeZone: string | null;
  todayLabel: string;
  yesterdayLabel: string;
}

/** Discord-style separator shown at the first message of each viewer-local day. */
export function ChatDaySeparator({
  date,
  locale,
  timeZone,
  todayLabel,
  yesterdayLabel,
}: ChatDaySeparatorProps) {
  const messageDate = parseDate(date);
  if (!messageDate) return null;

  const effectiveTimeZone = timeZone ?? SSR_TIME_ZONE;
  const messageParts = calendarParts(messageDate, effectiveTimeZone);
  const todayParts = calendarParts(new Date(), effectiveTimeZone);
  if (!messageParts || !todayParts) return null;

  const diffDays = dayIndex(todayParts) - dayIndex(messageParts);
  const fullDate = new Intl.DateTimeFormat(locale, {
    timeZone: effectiveTimeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(messageDate);
  // Relative labels are enabled only after mount. The SSR/first-client render
  // always uses the deterministic full UTC date, preventing hydration drift.
  const label = timeZone && diffDays === 0
    ? todayLabel
    : timeZone && diffDays === 1
      ? yesterdayLabel
      : fullDate;

  return (
    <div
      role="separator"
      aria-label={label}
      className="my-4 flex items-center gap-3 px-2"
    >
      <div className="h-px flex-1 bg-border/40" />
      <time
        dateTime={dateKey(messageParts)}
        suppressHydrationWarning
        className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50"
      >
        {label}
      </time>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}
