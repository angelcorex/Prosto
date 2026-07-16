'use client';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { ServerVerifiedIcon } from '@/lib/icons';
import { Tooltip } from './tooltip';

const sizes = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
  lg: 'h-6 w-6',
};

/** Verified-server badge (Discord-style), shown next to a server's name. */
export function ServerVerifiedBadge({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = useT('servers');
  return (
    <Tooltip content={t('verifiedServer')}>
      <ServerVerifiedIcon
        role="img"
        aria-label={t('verifiedServer')}
        className={cn(sizes[size], 'shrink-0 text-sky-300', className)}
      />
    </Tooltip>
  );
}
