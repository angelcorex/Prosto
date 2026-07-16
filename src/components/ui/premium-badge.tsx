'use client';

import { cn } from '@/lib/utils/cn';
import { Tooltip } from './tooltip';

const sizes = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
  lg: 'h-6 w-6',
};

/**
 * Super Prosto premium badge — shown next to the verified/moderator badges for
 * users with an active subscription (profiles.is_premium).
 */
export function PremiumBadge({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <Tooltip content="Super Prosto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/superprosto_badge.webp"
        alt=""
        role="img"
        aria-label="Super Prosto"
        className={cn(sizes[size], 'shrink-0', className)}
      />
    </Tooltip>
  );
}
