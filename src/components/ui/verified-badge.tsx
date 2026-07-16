'use client';

import { useState, useRef, useEffect } from 'react';
import { CalendarDays } from 'lucide-react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { VerifiedIcon } from '@/lib/icons';
import { Tooltip } from './tooltip';

interface VerifiedBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  /** Date string used to show "Verified since …" — typically profile created_at */
  sinceDate?: string | null;
  className?: string;
}

const sizes = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
  lg: 'h-6 w-6',
};

/**
 * Twitter / X-style verified badge.
 * On hover shows a popover with title + verified-since date.
 */
export function VerifiedBadge({ size = 'md', sinceDate, className }: VerifiedBadgeProps) {
  const t = useT('verified');
  const [visible, setVisible] = useState(false);
  const [coords, setCoords]   = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top:  rect.bottom + window.scrollY + 10,
      left: rect.left   + window.scrollX + rect.width / 2,
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    function onOutside(e: MouseEvent) {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !popoverRef.current?.contains(e.target as Node)
      ) {
        setVisible(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [visible]);

  const since = sinceDate
    ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(sinceDate))
    : null;

  // No sinceDate — a simple icon with a hover label (same as the moderator /
  // premium badges). Tooltip renders a <span>, so it's safe inside a <button>.
  if (!sinceDate) {
    return (
      <Tooltip content={t('title')}>
        <VerifiedIcon
          aria-label={t('ariaLabel')}
          role="img"
          className={cn(sizes[size], 'shrink-0 translate-y-[1px] text-sky-500', className)}
        />
      </Tooltip>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('ariaLabel')}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
        className="inline-flex shrink-0 items-center focus:outline-none"
      >
        <VerifiedIcon
          aria-hidden
          className={cn(sizes[size], 'shrink-0 translate-y-[1px] text-sky-500', className)}
        />
      </button>

      {visible && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
          style={{
            position: 'absolute',
            top:  coords.top,
            left: coords.left,
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
          className="w-[260px] rounded-2xl border border-border bg-card p-4 shadow-lg animate-fade-in"
        >
          {/* Arrow */}
          <div
            style={{ left: '50%', transform: 'translateX(-50%)' }}
            className="absolute -top-[7px] h-3 w-3 rotate-45 rounded-sm border-l border-t border-border bg-card"
          />

          <p className="mb-3 text-[15px] font-bold text-foreground">
            {t('title')}
          </p>

          <div className="flex items-start gap-3">
            <VerifiedIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {t('description')}
            </p>
          </div>

          {since && (
            <div className="mt-2.5 flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {t('since', { date: since })}
              </p>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
