import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Reusable multi-line text input wired to design tokens. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-20 w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm',
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

Textarea.displayName = 'Textarea';
