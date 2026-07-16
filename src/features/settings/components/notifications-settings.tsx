'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { setNotifyPrefs, type NotifyPrefs } from '../api/actions';

interface NotificationsSettingsProps {
  initial: NotifyPrefs;
}

/**
 * Global notification preferences — master sound + per-surface sound toggles and
 * a toast toggle. Per-server overrides live on each server (rail → notify menu),
 * linked at the bottom. Optimistic + persisted via set_notify_prefs.
 */
export function NotificationsSettings({ initial }: NotificationsSettingsProps) {
  const t = useT('settings.notifications');
  const [prefs, setPrefs] = useState<NotifyPrefs>(initial);
  const [, startTransition] = useTransition();

  function toggle(key: keyof NotifyPrefs) {
    const next = !prefs[key];
    setPrefs((prev) => ({ ...prev, [key]: next }));
    startTransition(() => { void setNotifyPrefs({ [key]: next }); });
  }

  // Per-surface toggles are disabled when the master sound is off.
  const soundOff = !prefs.sound_enabled;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-lg font-bold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>

      <section className="mb-4 rounded-2xl bg-secondary/40 p-5">
        <Row label={t('soundEnabled')} desc={t('soundEnabledDesc')} on={prefs.sound_enabled} onClick={() => toggle('sound_enabled')} />
        <div className="mt-1 border-t border-border/30 pt-1">
          <Row label={t('dmSound')} on={prefs.dm_sound} disabled={soundOff} onClick={() => toggle('dm_sound')} />
          <Row label={t('serverSound')} on={prefs.server_sound} disabled={soundOff} onClick={() => toggle('server_sound')} />
          <Row label={t('mentionSound')} on={prefs.mention_sound} disabled={soundOff} onClick={() => toggle('mention_sound')} />
          <Row label={t('friendSound')} on={prefs.friend_sound} disabled={soundOff} onClick={() => toggle('friend_sound')} />
        </div>
      </section>

      <section className="mb-4 rounded-2xl bg-secondary/40 p-5">
        <Row label={t('toastsEnabled')} desc={t('toastsEnabledDesc')} on={prefs.toasts_enabled} onClick={() => toggle('toasts_enabled')} />
      </section>

      <p className="px-1 text-[13px] text-muted-foreground">
        {t('perServerHint')}{' '}
        <Link href="/" className="font-medium text-link hover:underline">{t('perServerLink')}</Link>
      </p>
    </div>
  );
}

function Row({ label, desc, on, disabled, onClick }: {
  label: string; desc?: string; on: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-accent/40',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-foreground">{label}</span>
        {desc && <span className="mt-0.5 block text-[12px] text-muted-foreground">{desc}</span>}
      </span>
      <span className={cn('flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', on ? 'bg-link' : 'bg-muted')}>
        <span className={cn('h-5 w-5 rounded-full bg-white transition-transform', on && 'translate-x-5')} />
      </span>
    </button>
  );
}
