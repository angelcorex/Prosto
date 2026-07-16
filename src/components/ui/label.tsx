import { forwardRef, type LabelHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

/** Form label wired to design tokens. */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => {
  return (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium text-foreground',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
});

Label.displayName = 'Label';
