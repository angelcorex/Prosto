'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { deleteBot } from '../api/actions';
import type { BotDetail } from '../types';
import { errorMessage } from './errors';

/**
 * Danger zone: permanently delete the bot. Deletion cascades (tokens, commands,
 * interactions, server memberships) and removes the underlying auth user. Gated
 * behind typing the bot's username to confirm.
 */
export function BotDangerPanel({ bot }: { bot: BotDetail }) {
  const t = useT('developers');
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true); setError(null);
    const res = await deleteBot(bot.id);
    setBusy(false);
    if (!res.ok) { setError(errorMessage(t, res.error)); return; }
    router.push('/developers');
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div>
        <h3 className="font-medium text-destructive">{t('deleteBotTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('deleteBotBody')}</p>
      </div>
      <p className="text-sm">{t('deleteConfirmPrompt', { username: bot.username })}</p>
      <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={bot.username} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button variant="destructive" onClick={remove} isLoading={busy} disabled={confirm !== bot.username}>
        {t('deleteBotButton')}
      </Button>
    </div>
  );
}
