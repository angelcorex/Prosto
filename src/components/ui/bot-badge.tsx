'use client';

import { cn } from '@/lib/utils/cn';

const sizes = {
  sm: 'text-[9px] px-1.5 py-px',
  md: 'text-[10px] px-2 py-0.5',
  lg: 'text-xs px-2.5 py-0.5',
};

/**
 * "BOT" tag shown next to a bot account's name (Discord/Telegram style), so a
 * bot is never mistaken for a human. Rendered wherever names appear with other
 * badges (message authorship, profiles, member lists). Fully-rounded blue pill.
 */
export function BotBadge({ size = 'sm', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full font-bold uppercase leading-none tracking-wide',
        'bg-sky-500/15 text-sky-500',
        sizes[size],
        className,
      )}
    >
      Bot
    </span>
  );
}
