'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Terminal, Plus, ChevronRight } from 'lucide-react';

import { Button, Input, Textarea, BotBadge } from '@/components/ui';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useT } from '@/providers/i18n-provider';
import { createBot } from '../api/actions';
import { TokenRevealModal } from './token-reveal-modal';
import { errorMessage } from './errors';

export interface BotSummary {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  description: string | null;
  is_active: boolean;
  command_count: number;
}

/**
 * Developer portal home: the list of bots the user owns + a "new bot" form.
 * On creation the ONE-TIME token is shown in a reveal modal (never again).
 * The avatar is set afterwards in the editor (needs the bot id to upload).
 */
export function BotsOverview({ bots }: { bots: BotSummary[] }) {
  const t = useT('developers');
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealToken, setRevealToken] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await createBot({ username, displayName, description });
    setBusy(false);
    if (!res.ok) { setError(errorMessage(t, res.error)); return; }
    setRevealToken(res.data.token);
    setCreating(false);
    setUsername(''); setDisplayName(''); setDescription('');
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('botsTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('botsSubtitle')}</p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t('newBot')}
          </Button>
        )}
      </header>

      {creating && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-medium">{t('createTitle')}</h2>
          <div className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('fieldUsername')}</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="my_bot" maxLength={30} />
              <p className="mt-1 text-xs text-muted-foreground">{t('usernameHint')}</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('fieldDisplayName')}</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="My Bot" maxLength={40} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('fieldDescription')}</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={200} />
            </div>
            <p className="text-xs text-muted-foreground">{t('avatarLaterHint')}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy || username.length < 3} isLoading={busy}>{t('create')}</Button>
            <Button variant="ghost" onClick={() => { setCreating(false); setError(null); }}>{t('cancel')}</Button>
          </div>
        </div>
      )}

      {bots.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="rounded-full bg-primary/10 p-3"><Terminal className="h-7 w-7 text-primary" /></div>
          <p className="text-sm text-muted-foreground">{t('emptyBots')}</p>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> {t('newBot')}</Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {bots.map((bot) => (
            <button
              key={bot.id}
              type="button"
              onClick={() => router.push(`/developers/bots/${bot.id}`)}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/50"
            >
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-primary/10">
                {bot.avatar_url
                  ? <AvatarImage src={bot.avatar_url} alt={bot.username} className="object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-primary">{(bot.username[0] ?? '?').toUpperCase()}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{bot.display_name || bot.username}</span>
                  <BotBadge />
                  {!bot.is_active && <span className="text-[11px] text-muted-foreground">{t('disabled')}</span>}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  @{bot.username} · {t('commandCount', { count: String(bot.command_count) })}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {revealToken && <TokenRevealModal token={revealToken} onClose={() => setRevealToken(null)} />}
    </div>
  );
}
