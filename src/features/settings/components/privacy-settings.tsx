'use client';

import { useState, useTransition } from 'react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { setPrivacySettings, type PrivacyLevel, type PrivacySettings as Settings } from '../api/actions';

interface PrivacySettingsProps {
  initial: Settings;
}

/**
 * Privacy settings — three rows (profile / messages / friend requests), each a
 * segmented Everyone · Friends · Nobody control. Optimistic + persisted via the
 * set_privacy_settings RPC.
 */
export function PrivacySettings({ initial }: PrivacySettingsProps) {
  const t = useT('settings.privacy');
  const [values, setValues] = useState<Settings>(initial);
  const [, startTransition] = useTransition();

  function update(key: keyof Settings, level: PrivacyLevel) {
    setValues((prev) => ({ ...prev, [key]: level }));
    startTransition(() => { void setPrivacySettings({ [key]: level }); });
  }

  const rows: { key: keyof Settings; title: string; desc: string }[] = [
    { key: 'privacy_profile',    title: t('profileTitle'),   desc: t('profileDesc') },
    { key: 'privacy_messages',   title: t('messagesTitle'),  desc: t('messagesDesc') },
    { key: 'privacy_friend_req', title: t('friendReqTitle'), desc: t('friendReqDesc') },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-lg font-bold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <section key={row.key} className="rounded-2xl bg-secondary/40 p-5">
            <div className="mb-3">
              <p className="text-[15px] font-semibold">{row.title}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{row.desc}</p>
            </div>
            <Segmented value={values[row.key]} onChange={(l) => update(row.key, l)} t={t} />
          </section>
        ))}
      </div>
    </div>
  );
}

function Segmented({ value, onChange, t }: {
  value: PrivacyLevel;
  onChange: (level: PrivacyLevel) => void;
  t: (k: string) => string;
}) {
  const opts: { key: PrivacyLevel; label: string }[] = [
    { key: 'everyone', label: t('everyone') },
    { key: 'friends',  label: t('friends') },
    { key: 'nobody',   label: t('nobody') },
  ];
  return (
    <div className="flex w-full rounded-xl bg-background/60 p-1 ring-1 ring-border/40 sm:inline-flex sm:w-auto">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'flex-1 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors sm:flex-none sm:py-1.5 sm:text-[13px]',
            value === o.key ? 'bg-accent text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
