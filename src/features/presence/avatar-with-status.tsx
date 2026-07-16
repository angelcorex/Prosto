'use client';

import { cn } from '@/lib/utils/cn';
import { StatusDot } from './status-dot';

interface AvatarWithStatusProps {
  status?: string | null;
  lastSeen?: string | null;
  /** Avatar diameter in px */
  size: number;
  /** Status dot diameter in px (defaults to ~32% of avatar) */
  dotSize?: number;
  /** Transparent gap (px) carved around the dot inside the avatar */
  gap?: number;
  className?: string;
  /** Avatar visual — should fill its container (e.g. <Image fill /> or initial) */
  children: React.ReactNode;
}

/**
 * Avatar with a Discord-style presence dot. The avatar is masked so a real
 * transparent circle is carved out behind the dot (no coloured ring).
 */
export function AvatarWithStatus({
  status,
  lastSeen,
  size,
  dotSize = Math.round(size * 0.22),
  gap = 2,
  className,
  children,
}: AvatarWithStatusProps) {
  const r     = dotSize / 2;
  const holeR = r + gap;

  // Dot sits in the bottom-right corner; its centre defines the mask hole.
  const cx = size - r;
  const cy = size - r;

  const mask = `radial-gradient(circle ${holeR}px at ${cx}px ${cy}px, transparent ${holeR}px, #000 ${holeR + 0.5}px)`;

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <div
        className="relative h-full w-full overflow-hidden rounded-full bg-muted"
        style={{ WebkitMaskImage: mask, maskImage: mask }}
      >
        {children}
      </div>
      <span
        className="absolute"
        style={{ left: cx - r, top: cy - r, width: dotSize, height: dotSize }}
      >
        <StatusDot status={status} lastSeen={lastSeen} className="h-full w-full" />
      </span>
    </div>
  );
}
