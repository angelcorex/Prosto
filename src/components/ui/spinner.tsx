import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

type SpinnerSize = 'sm' | 'md' | 'lg';

const sizes: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

/**
 * Inline activity indicator for tight spaces (e.g. inside buttons).
 * For page/section loading, use skeletons instead.
 */
export function Spinner({ size = 'md', className }: { size?: SpinnerSize; className?: string }) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      className={cn('animate-spin text-current', sizes[size], className)}
    />
  );
}
