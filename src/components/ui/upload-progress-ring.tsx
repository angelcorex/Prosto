'use client';

import { cn } from '@/lib/utils/cn';

interface UploadProgressRingProps {
  /** 0–100. When undefined the ring shows an indeterminate spinner. */
  percent?: number;
  /** Diameter of the ring in px. Default 40. */
  size?: number;
  /** Stroke width in px. Default 3. */
  strokeWidth?: number;
  className?: string;
}

/**
 * Circular upload-progress indicator.
 *
 * - 0–100 → determinate arc (like iMessage / Telegram)
 * - undefined → indeterminate spinning arc (fallback when no XHR progress)
 *
 * Designed to be overlaid on top of a media thumbnail.
 */
export function UploadProgressRing({
  percent,
  size = 40,
  strokeWidth = 3,
  className,
}: UploadProgressRingProps) {
  const r    = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const isDeterminate = percent !== undefined;
  const offset = isDeterminate ? circ * (1 - Math.min(100, Math.max(0, percent)) / 100) : circ * 0.75;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(!isDeterminate && 'animate-spin', className)}
      aria-label={isDeterminate ? `${Math.round(percent ?? 0)}%` : 'Uploading'}
      role="progressbar"
      aria-valuenow={isDeterminate ? Math.round(percent ?? 0) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="white"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        /* Start arc at 12-o'clock */
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={isDeterminate ? 'transition-[stroke-dashoffset] duration-150 ease-out' : ''}
      />
    </svg>
  );
}
