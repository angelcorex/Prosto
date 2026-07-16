import type { ElementType, HTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

type ContainerWidth = 'sm' | 'md' | 'lg' | 'xl';

const widths: Record<ContainerWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  width?: ContainerWidth;
  as?: ElementType;
}

/**
 * Centered, width-constrained content wrapper. Widths map to the centralized
 * container tokens in `config/layout.ts`.
 */
export function Container({
  width = 'lg',
  as: Component = 'div',
  className,
  ...props
}: ContainerProps) {
  return (
    <Component className={cn('mx-auto w-full px-4', widths[width], className)} {...props} />
  );
}
