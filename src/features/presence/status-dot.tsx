'use client';

import { cn } from '@/lib/utils/cn';
import { STATUS_COLOR, effectiveStatus } from './presence';

interface StatusDotProps {
  status?: string | null;
  lastSeen?: string | null;
  /** Tailwind size classes, default h-3 w-3 */
  className?: string;
}

/** Coloured presence dot (online/idle/dnd/offline). Minimal solid circle. */
export function StatusDot({ status, lastSeen, className }: StatusDotProps) {
  const eff = effectiveStatus(status, lastSeen);
  return (
    <span
      className={cn(
        'block shrink-0 rounded-full',
        STATUS_COLOR[eff],
        className ?? 'h-3 w-3',
      )}
    />
  );
}
