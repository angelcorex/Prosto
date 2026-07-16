'use client';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { PROVIDERS, type ProviderId } from './providers';
import type { PublicConnection } from './types';

/**
 * Connections section shown on a public profile (Discord-style chips).
 * `compact` renders smaller chips for tight spaces (e.g. the profile popup).
 */
export function ProfileConnections({
  connections,
  className = 'mt-5 mb-5',
  compact = false,
}: {
  connections: PublicConnection[];
  className?: string;
  compact?: boolean;
}) {
  const t = useT('connections');
  if (connections.length === 0) return null;

  return (
    <div className={className}>
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted-foreground/70">{t('title')}</p>
      <div className="flex flex-wrap gap-2">
        {connections.map((c) => {
          const meta = PROVIDERS[c.provider as ProviderId];
          if (!meta) return null;
          const inner = (
            <span
              className={cn(
                'flex items-center rounded-xl border border-border/50 bg-card/60 text-foreground transition-colors hover:bg-accent/50',
                compact ? 'gap-1.5 px-2.5 py-1.5' : 'gap-2.5 px-3 py-2',
              )}
            >
              <i className={meta.icon} style={{ fontSize: compact ? 18 : 22 }} aria-hidden="true" />
              <span className={cn('font-semibold', compact ? 'text-[13px]' : 'text-[14px]')}>{c.provider_username || meta.label}</span>
              {c.provider_url && <i className="ri-arrow-right-up-line text-[15px] text-muted-foreground/60" aria-hidden="true" />}
            </span>
          );
          return c.provider_url ? (
            <a key={c.provider} href={c.provider_url} target="_blank" rel="noopener noreferrer">{inner}</a>
          ) : (
            <div key={c.provider}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
