'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';
import { Button } from '@/components/ui';
import { ChangePasswordForm, DeleteAccountDialog } from '@/features/auth';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local === undefined) return '•'.repeat(Math.max(email.length, 6));
  return `${'•'.repeat(Math.max(local.length, 3))}@${domain}`;
}

interface AccountSettingsProps {
  username: string;
  email: string;
}

export function AccountSettings({ username, email }: AccountSettingsProps) {
  const t = useT('account');
  const [revealed, setRevealed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-lg font-bold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>

      {/* Account info */}
      <section className="mb-6 rounded-2xl bg-secondary/40 p-5">
        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {t('info')}
        </h2>

        <div className="flex items-center justify-between gap-4 border-b border-border/30 pb-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {t('username')}
            </p>
            <p className="mt-1 truncate text-[15px] font-medium">{username}</p>
          </div>
          <Link
            href="/settings/profile"
            replace
            className="shrink-0 rounded-full bg-accent/60 px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t('edit')}
          </Link>
        </div>

        <div className="flex items-center justify-between gap-4 pt-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {t('email')}
            </p>
            <p className="mt-1 truncate text-[15px] font-medium">
              {revealed ? email : maskEmail(email)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/60 px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {revealed ? t('hide') : t('reveal')}
          </button>
        </div>
      </section>

      {/* Password & security */}
      <section className="mb-6 rounded-2xl bg-secondary/40 p-5">
        <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {t('security')}
        </h2>
        <p className="mb-4 text-[13px] text-muted-foreground">{t('securityHint')}</p>
        <ChangePasswordForm />
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-destructive">
          {t('dangerZone')}
        </h2>
        <p className="mb-4 text-[13px] text-muted-foreground">{t('deleteHint')}</p>
        <Button variant="destructive" size="md" onClick={() => setConfirmDelete(true)}>
          {t('deleteAccount')}
        </Button>
      </section>

      {confirmDelete && <DeleteAccountDialog onClose={() => setConfirmDelete(false)} />}
    </div>
  );
}
