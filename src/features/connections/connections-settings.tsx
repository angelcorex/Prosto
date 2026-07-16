'use client';

import { useState, useTransition } from 'react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import {
  PROVIDER_LIST,
  buildProviderUrl,
  displayHandle,
  type ProviderId,
  type ProviderMeta,
} from './providers';
import { addManualConnection, disconnectProvider, setConnectionVisibility } from './actions';
import type { Connection } from './types';

export function ConnectionsSettings({ connections }: { connections: Connection[] }) {
  const t = useT('connections');
  const [items, setItems] = useState<Connection[]>(connections);
  const [editing, setEditing] = useState<ProviderId | null>(null);
  const [handle, setHandle] = useState('');
  const [error, setError] = useState(false);
  const [linking, setLinking] = useState<ProviderId | null>(null);
  const [, startTransition] = useTransition();

  const byProvider = new Map(items.map((c) => [c.provider, c]));

  /**
   * Poll-based link flow (Ataraxis): POST to start a link, open the provider's
   * approval page in a popup, then poll our status endpoint until approved. On
   * approval the server has already stored the connection, so reflect it here.
   */
  async function startPollLink(meta: ProviderMeta) {
    if (linking) return;
    setLinking(meta.id);
    try {
      const res = await fetch(`/api/connections/${meta.id}/connect`, { method: 'POST' });
      if (!res.ok) { setLinking(null); return; }
      const { linkUrl, linkToken, expiresIn } = await res.json();
      if (!linkUrl || !linkToken) { setLinking(null); return; }

      window.open(linkUrl, '_blank', 'noopener,noreferrer,width=480,height=720');

      const deadline = Date.now() + Math.min(Number(expiresIn ?? 900), 900) * 1000;
      const poll = async () => {
        if (Date.now() > deadline) { setLinking(null); return; }
        try {
          const s = await fetch(`/api/connections/${meta.id}/status?token=${encodeURIComponent(linkToken)}`, { cache: 'no-store' });
          const { status } = await s.json();
          if (status === 'approved') {
            setItems((prev) => [
              ...prev.filter((c) => c.provider !== meta.id),
              { provider: meta.id, provider_username: meta.label, provider_url: null, show_on_profile: true },
            ]);
            setLinking(null);
            return;
          }
          if (status === 'expired') { setLinking(null); return; }
        } catch { /* keep polling */ }
        setTimeout(poll, 2500);
      };
      setTimeout(poll, 2500);
    } catch {
      setLinking(null);
    }
  }

  function toggleVisibility(provider: ProviderId, next: boolean) {
    setItems((prev) => prev.map((c) => (c.provider === provider ? { ...c, show_on_profile: next } : c)));
    startTransition(async () => { await setConnectionVisibility(provider, next); });
  }

  function disconnect(provider: ProviderId) {
    setItems((prev) => prev.filter((c) => c.provider !== provider));
    startTransition(async () => { await disconnectProvider(provider); });
  }

  function openEditor(provider: ProviderId) {
    setEditing(provider);
    setHandle('');
    setError(false);
  }

  function saveManual(meta: ProviderMeta) {
    const url = buildProviderUrl(meta, handle);
    if (!url) { setError(true); return; }
    const username = displayHandle(meta, handle);

    // Optimistic: reflect the new connection immediately, reconcile on the server.
    setItems((prev) => [
      ...prev.filter((c) => c.provider !== meta.id),
      { provider: meta.id, provider_username: username, provider_url: url, show_on_profile: true },
    ]);
    setEditing(null);
    setHandle('');
    startTransition(async () => {
      const res = await addManualConnection(meta.id, handle);
      if (res.error) setItems((prev) => prev.filter((c) => c.provider !== meta.id));
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">{t('subtitle')}</p>

      <div className="mt-6 flex flex-col gap-3">
        {PROVIDER_LIST.map((p) => {
          const conn = byProvider.get(p.id);
          const isEditing = editing === p.id;
          return (
            <div key={p.id} className="rounded-2xl border border-border/40 bg-background/40 p-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <i className={p.icon} style={{ fontSize: 24 }} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{p.label}</p>
                  {conn ? (
                    <p className="truncate text-[13px] text-muted-foreground">{conn.provider_username || t('connected')}</p>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">{t('notConnected')}</p>
                  )}
                </div>

                {conn ? (
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
                    <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-[14px] text-muted-foreground sm:text-[13px]">
                      <input
                        type="checkbox"
                        checked={conn.show_on_profile}
                        onChange={(e) => toggleVisibility(p.id, e.target.checked)}
                        className="h-5 w-5 accent-link sm:h-4 sm:w-4"
                      />
                      {t('showOnProfile')}
                    </label>
                    <button
                      type="button"
                      onClick={() => disconnect(p.id)}
                      className="rounded-lg px-3 py-2 text-[14px] font-medium text-destructive transition-colors hover:bg-destructive/10 sm:py-1.5 sm:text-[13px]"
                    >
                      {t('disconnect')}
                    </button>
                  </div>
                ) : !p.available ? (
                  <span className="shrink-0 rounded-lg bg-secondary px-4 py-2 text-[13px] font-medium text-muted-foreground">
                    {t('comingSoon')}
                  </span>
                ) : p.kind === 'oauth' && p.pollLink ? (
                  <button
                    type="button"
                    onClick={() => startPollLink(p)}
                    disabled={linking === p.id}
                    className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {linking === p.id ? t('linking') : t('connect')}
                  </button>
                ) : p.kind === 'oauth' ? (
                  <a
                    href={`/api/connections/${p.id}/connect`}
                    className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-opacity hover:opacity-90"
                  >
                    {t('connect')}
                  </a>
                ) : isEditing ? (
                  <button
                    type="button"
                    onClick={() => { setEditing(null); setError(false); }}
                    className="shrink-0 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    {t('cancel')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openEditor(p.id)}
                    className="shrink-0 rounded-lg border border-border/60 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-accent"
                  >
                    {t('add')}
                  </button>
                )}
              </div>

              {isEditing && !conn ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); saveManual(p); }}
                  className="mt-3 flex items-center gap-2 border-t border-border/30 pt-3"
                >
                  <input
                    autoFocus
                    value={handle}
                    onChange={(e) => { setHandle(e.target.value); setError(false); }}
                    placeholder={p.placeholder}
                    aria-invalid={error}
                    className={cn(
                      'min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-[14px] outline-none transition-colors',
                      error ? 'border-destructive' : 'border-border/60 focus:border-link',
                    )}
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    disabled={handle.trim().length === 0}
                  >
                    {t('save')}
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
