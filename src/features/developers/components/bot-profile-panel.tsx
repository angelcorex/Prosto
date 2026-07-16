'use client';

import { useState } from 'react';

import { Button, Input, Textarea } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { updateBot } from '../api/actions';
import type { BotDetail } from '../types';
import { errorMessage } from './errors';
import { BotAvatarUpload } from './bot-avatar-upload';

/** Edit a bot's avatar (file upload), display name, description, and active state. */
export function BotProfilePanel({ bot, onSaved }: { bot: BotDetail; onSaved: () => void }) {
  const t = useT('developers');
  const [avatarUrl, setAvatarUrl] = useState(bot.avatar_url);
  const [displayName, setDisplayName] = useState(bot.display_name ?? '');
  const [description, setDescription] = useState(bot.description ?? '');
  const [active, setActive] = useState(bot.is_active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    const res = await updateBot(bot.id, { displayName, description, isActive: active });
    setBusy(false);
    if (!res.ok) { setError(errorMessage(t, res.error)); return; }
    setSaved(true);
    onSaved();
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('fieldAvatar')}</label>
        <BotAvatarUpload
          botId={bot.id}
          current={avatarUrl}
          initial={(bot.username[0] ?? '?').toUpperCase()}
          onUploaded={(url) => { setAvatarUrl(url); onSaved(); }}
        />
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('fieldDisplayName')}</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('fieldDescription')}</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={200} />
        </div>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
          {t('fieldActive')}
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-500">{t('saved')}</p>}
      <Button onClick={save} isLoading={busy}>{t('saveChanges')}</Button>

      {/* Read-only view of the slash commands the bot's code has registered.
          Commands are defined in code and synced via PUT /api/v1/commands — the
          portal doesn't edit them. */}
      <div className="border-t border-border/40 pt-5">
        <h3 className="mb-1 text-sm font-medium">{t('registeredCommands')}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t('commandsCodeHint')}</p>
        {bot.commands.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noCommandsYet')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {bot.commands.map((c) => (
              <span key={c.id} className="inline-flex items-center rounded-lg bg-muted px-2 py-1 font-mono text-xs" title={c.description || undefined}>
                /{c.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
