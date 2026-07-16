import Image from 'next/image';
import { User } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const sizes: Record<AvatarSize, { wrapper: string; px: number; icon: string }> = {
  sm: { wrapper: 'h-8 w-8', px: 32, icon: 'h-4 w-4' },
  md: { wrapper: 'h-10 w-10', px: 40, icon: 'h-5 w-5' },
  lg: { wrapper: 'h-12 w-12', px: 48, icon: 'h-6 w-6' },
  xl: { wrapper: 'h-20 w-20', px: 80, icon: 'h-10 w-10' },
};

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: AvatarSize;
  className?: string;
}

/**
 * User avatar with graceful fallback to a neutral icon when no image is set.
 * Initials/identity rendering can be layered on later by features.
 */
export function Avatar({ src, alt = '', size = 'md', className }: AvatarProps) {
  const { wrapper, px, icon } = sizes[size];

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground',
        wrapper,
        className,
      )}
    >
      {src ? (
        <Image src={src} alt={alt} width={px} height={px} className="h-full w-full object-cover" />
      ) : (
        <User className={icon} aria-hidden="true" />
      )}
    </span>
  );
}
