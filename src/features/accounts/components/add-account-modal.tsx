'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';
import { Button } from '@/components/ui';
import { site } from '@/config';
import { CredentialsFields } from '@/features/auth/components/credentials-fields';
import { UsernameField } from '@/features/auth/components/username-field';
import { TurnstileWidget, TURNSTILE_ENABLED } from '@/features/auth/components/turnstile-widget';
import { submitAddAccount } from '../api/actions';
import { AccountSwitchOverlay } from './account-switch-overlay';
import type { AddAccountState } from '../types';

const empty: AddAccountState = {};

/**
 * Modal to add another account to this device — log into an existing one or
 * register a new one. On success the new account becomes active and we hard-
 * reload so the whole app re-initialises as that user.
 */
export function AddAccountModal({ onClose }: { onClose: () => void }) {
  const t = useT('accounts');
  const ta = useT('auth.signUp');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [state, formAction, isPending] = useActionState(submitAddAccount, empty);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (state.ok) window.location.href = site.routes.home;
  }, [state.ok]);

  if (typeof document === 'undefined') return null;

  // On success we reload as the new account — cover everything meanwhile.
  if (state.ok) return <AccountSwitchOverlay />;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-card p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-2xl font-bold tracking-tight">{t('addTitle')}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('addSubtitle')}</p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="mode" value={mode} />

          {mode === 'register' && <UsernameField error={state.fieldErrors?.username} />}

          <CredentialsFields errors={state.fieldErrors} />

          {mode === 'register' && (
            <TermsCheckbox
              invalid={Boolean(state.fieldErrors?.agree)}
              checked={agreed}
              onChange={setAgreed}
            />
          )}

          {state.error ? (
            <p className="text-sm text-destructive" role="alert">{state.error}</p>
          ) : null}

          <TurnstileWidget onVerify={setCaptchaToken} resetKey={state} />

          <Button
            type="submit"
            size="md"
            isLoading={isPending}
            disabled={(TURNSTILE_ENABLED && !captchaToken) || (mode === 'register' && !agreed)}
            className="w-full"
          >
            {mode === 'login' ? t('addLoginSubmit') : t('addRegisterSubmit')}
          </Button>

          <button
            type="button"
            onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
            className="text-center text-xs font-medium text-link hover:underline"
          >
            {mode === 'login' ? t('switchToRegister') : t('switchToLogin')}
          </button>

          {mode === 'register' && (
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground/70">
              {ta('terms')}{' '}
              <Link href={site.routes.legal.terms} target="_blank" className="text-link hover:underline">{ta('termsLink')}</Link>
              {', '}
              <Link href={site.routes.legal.privacy} target="_blank" className="text-link hover:underline">{ta('privacyLink')}</Link>{' '}
              {ta('and')}{' '}
              <Link href={site.routes.legal.guidelines} target="_blank" className="text-link hover:underline">{ta('guidelinesLink')}</Link>.
            </p>
          )}
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** Agreement checkbox shown only in register mode (controlled — gates submit). */
function TermsCheckbox({ invalid, checked, onChange }: { invalid: boolean; checked: boolean; onChange: (v: boolean) => void }) {
  const t = useT('accounts');
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        name="agree"
        value="yes"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid}
        className="h-4 w-4 shrink-0 accent-link"
      />
      <span>{t('agree')}</span>
    </label>
  );
}
