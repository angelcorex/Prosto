import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'destructive';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-border text-foreground',
  success: 'bg-success text-success-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** Compact status/label pill. */
export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
