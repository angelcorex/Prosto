import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Reusable text input wired to design tokens. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm',
          'text-foreground placeholder:text-muted-foreground',
          'outline-none transition-colors duration-fast',
          'focus:border-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
