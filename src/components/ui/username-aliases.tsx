'use client';

import Link from 'next/link';

import { cn } from '@/lib/utils/cn';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { AvatarImage } from './avatar-image';
import { Tooltip } from './tooltip';

export interface UsernameAliasesProps {
  /** The user's additional usernames (Super Prosto). Empty → renders nothing. */
  aliases: string[];
  /** Owner display name — shown in the alias tooltip. */
  displayName: string;
  /** Owner avatar — shown in the alias tooltip. */
  avatarUrl?: string | null;
  /** Text size class for the handles (match the surrounding @username). */
  className?: string;
  /** Called when an alias link is clicked (e.g. to close a popup). */
  onNavigate?: () => void;
}

/**
 * Renders a user's additional usernames as `also @a1 @a2 …`. Each handle is a
 * link to its profile (the app redirects the alias URL to the canonical one)
 * and, on hover, shows a small card confirming it's this user's unique username
 * (with their avatar). Used on the profile page and the profile popup.
 */
export function UsernameAliases({
  aliases,
  displayName,
  avatarUrl,
  className,
  onNavigate,
}: UsernameAliasesProps) {
  const t = useT('profile');
  if (aliases.length === 0) return null;

  const initial = displayName[0]?.toUpperCase() ?? '?';

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className={cn('text-muted-foreground/50', className)}>{t('alsoKnownAs')}</span>
      {aliases.map((alias) => (
        <Tooltip
          key={alias}
          side="bottom"
          content={
            <span className="flex items-center gap-2">
              <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-secondary">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt="" sizes="24px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-link">
                    {initial}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">@{alias}</span>
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {t('aliasTooltip', { name: displayName })}
                </span>
              </span>
            </span>
          }
        >
          <Link
            href={site.routes.profile(alias)}
            onClick={onNavigate}
            className={cn('text-muted-foreground/60 transition-colors hover:text-link', className)}
          >
            @{alias}
          </Link>
        </Tooltip>
      ))}
    </span>
  );
}
