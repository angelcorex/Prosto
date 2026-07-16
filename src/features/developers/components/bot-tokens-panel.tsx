'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, Input } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { createToken, revokeToken } from '../api/actions';
import type { BotDetail } from '../types';
import { TokenRevealModal } from './token-reveal-modal';
import { errorMessage } from './errors';

/**
 * Manage a bot's API tokens: list by prefix + last-used, create (one-time
 * reveal), and revoke. Full plaintext is never shown after creation.
 */
export function BotTokensPanel({ bot, onChanged }: { bot: BotDetail; onChanged: () => void }) {
  const t = useT('developers');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null);
    const res = await createToken(bot.id, name || undefined);
    setBusy(false);
    if (!res.ok) { setError(errorMessage(t, res.error)); return; }
    setReveal(res.data.token);
    setName('');
    onChanged();
  }

  async function revoke(id: string) {
    const res = await revokeToken(bot.id, id);
    if (!res.ok) { setError(errorMessage(t, res.error)); return; }
    onChanged();
  }

  const active = bot.tokens.filter((tk) => !tk.revoked_at);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('tokensIntro')}</p>

      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('tokenNamePlaceholder')} maxLength={60} className="flex-1" />
        <Button onClick={create} isLoading={busy}><Plus className="h-4 w-4" /> {t('createToken')}</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="divide-y divide-border/40">
        {active.length === 0 && <p className="py-4 text-sm text-muted-foreground">{t('noTokens')}</p>}
        {active.map((tk) => (
          <div key={tk.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{tk.name || t('unnamedToken')}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {tk.token_prefix} · {tk.last_used_at ? t('lastUsed', { when: new Date(tk.last_used_at).toLocaleString() }) : t('neverUsed')}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => revoke(tk.id)} title={t('revoke')}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {reveal && <TokenRevealModal token={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}
