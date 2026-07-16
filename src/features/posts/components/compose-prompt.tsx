'use client';

import { AvatarImage } from '@/components/ui/avatar-image';

import { useT } from '@/providers/i18n-provider';
import { openComposer } from '../lib/composer-bus';

/**
 * Mobile-only tap target that opens the full-screen composer (Twitter-style).
 * Shown in the feed in place of the inline <ComposeBox>, which stays desktop-
 * only. A single tap on the prompt row opens the sheet — no cramped inline
 * editing on a phone.
 */
export function ComposePrompt({ avatarUrl, username }: { avatarUrl?: string | null; username: string }) {
  const t = useT('posts');
  const initial = username[0]?.toUpperCase() ?? '?';

  return (
    <button
      type="button"
      onClick={openComposer}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-card/50 px-4 py-3 text-left transition-colors active:bg-accent/40"
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-foreground/10 ring-1 ring-border/30">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={username} sizes="36px" className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[13px] font-bold text-foreground/50">{initial}</span>
        )}
      </span>
      <span className="text-[15px] text-muted-foreground/60">{t('compose.placeholder')}</span>
    </button>
  );
}
