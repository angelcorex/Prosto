'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useT } from '@/providers/i18n-provider';
import { addBotToServer, removeBotFromServer } from '../api/actions';
import type { BotDetail } from '../types';
import { errorMessage } from './errors';

/**
 * Add the bot to / remove it from servers the owner controls. A bot is a
 * profile, so this is just server_members membership (owner-guarded RPC).
 */
export function BotServersPanel({ bot, onChanged }: { bot: BotDetail; onChanged: () => void }) {
  const t = useT('developers');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function add(serverId: string) {
    setBusyId(serverId); setError(null);
    const res = await addBotToServer(bot.id, serverId);
    setBusyId(null);
    if (!res.ok) { setError(errorMessage(t, res.error)); return; }
    onChanged();
  }
  async function remove(serverId: string) {
    setBusyId(serverId); setError(null);
    const res = await removeBotFromServer(bot.id, serverId);
    setBusyId(null);
    if (!res.ok) { setError(errorMessage(t, res.error)); return; }
    onChanged();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t('serversIntro')}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <h3 className="mb-2 text-sm font-medium">{t('memberServers')}</h3>
        {bot.memberServers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('notInAnyServer')}</p>
        ) : (
          <div className="space-y-1">
            {bot.memberServers.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-2.5">
                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-primary/10">
                  {s.icon_url
                    ? <AvatarImage src={s.icon_url} alt={s.name} className="object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-primary">{(s.name[0] ?? '?').toUpperCase()}</span>}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                <Button size="sm" variant="ghost" onClick={() => remove(s.id)} disabled={busyId === s.id}>
                  <X className="h-4 w-4" /> {t('removeFromServer')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {bot.ownerServers.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">{t('addToServer')}</h3>
          <div className="space-y-1">
            {bot.ownerServers.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-2.5">
                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-primary/10">
                  {s.icon_url
                    ? <AvatarImage src={s.icon_url} alt={s.name} className="object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-primary">{(s.name[0] ?? '?').toUpperCase()}</span>}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                <Button size="sm" variant="outline" onClick={() => add(s.id)} disabled={busyId === s.id}>
                  <Plus className="h-4 w-4" /> {t('add')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
