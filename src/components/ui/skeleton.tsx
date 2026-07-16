import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * Base skeleton primitive. Compose these to mirror the final layout of any
 * async section. Loading states must never show plain text.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-skeleton rounded-md', className)}
      {...props}
    />
  );
}
