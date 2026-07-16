'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { AvatarImage } from '@/components/ui/avatar-image';
import { BotBadge } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import type { BotDetail } from '../types';
import { BotProfilePanel } from './bot-profile-panel';
import { BotTokensPanel } from './bot-tokens-panel';
import { BotServersPanel } from './bot-servers-panel';
import { BotDangerPanel } from './bot-danger-panel';

type Tab = 'overview' | 'tokens' | 'servers' | 'danger';

/**
 * Bot management page: tabbed editor for profile, API tokens, server membership,
 * and a danger zone. Slash commands are NOT edited here — they're defined in the
 * bot's code and synced via PUT /api/v1/commands. All writes go through
 * owner-guarded server actions ([[bot-platform]]).
 */
export function BotEditor({ bot }: { bot: BotDetail }) {
  const t = useT('developers');
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('tabOverview') },
    { id: 'tokens',   label: t('tabTokens') },
    { id: 'servers',  label: t('tabServers') },
    { id: 'danger',   label: t('tabDanger') },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-primary/10">
          {bot.avatar_url
            ? <AvatarImage src={bot.avatar_url} alt={bot.username} className="object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-lg font-bold text-primary">{(bot.username[0] ?? '?').toUpperCase()}</span>}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{bot.display_name || bot.username}</h1>
            <BotBadge size="md" />
          </div>
          <p className="text-sm text-muted-foreground">@{bot.username}</p>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-border/40">
        {TABS.map((it) => (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className={
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (tab === it.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {it.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        {tab === 'overview' && <BotProfilePanel bot={bot} onSaved={() => router.refresh()} />}
        {tab === 'tokens'   && <BotTokensPanel bot={bot} onChanged={() => router.refresh()} />}
        {tab === 'servers'  && <BotServersPanel bot={bot} onChanged={() => router.refresh()} />}
        {tab === 'danger'   && <BotDangerPanel bot={bot} />}
      </div>
    </div>
  );
}
