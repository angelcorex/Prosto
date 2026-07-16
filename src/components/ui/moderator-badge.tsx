'use client';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { ModeratorIcon } from '@/lib/icons';
import { Tooltip } from './tooltip';

const sizes = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
  lg: 'h-6 w-6',
};

/** Moderator badge — same placement as the verified check, distinct icon. */
export function ModeratorBadge({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = useT('moderator');
  return (
    <Tooltip content={t('title')}>
      <ModeratorIcon
        role="img"
        aria-label={t('ariaLabel')}
        className={cn(sizes[size], 'shrink-0 text-violet-500', className)}
      />
    </Tooltip>
  );
}
