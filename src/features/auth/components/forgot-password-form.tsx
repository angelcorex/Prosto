'use client';

import { useActionState, useState } from 'react';

import { useT } from '@/providers/i18n-provider';
import { Button, Input, Label } from '@/components/ui';
import { requestPasswordReset } from '../api/email-auth';
import { initialAuthState } from '../types';
import { TurnstileWidget, TURNSTILE_ENABLED } from './turnstile-widget';

export function ForgotPasswordForm() {
  const t = useT('auth.forgot');
  const tf = useT('auth.fields');
  const te = useT('auth.errors');
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialAuthState);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{tf('email')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={tf('emailPlaceholder')}
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
        {state.fieldErrors?.email ? (
          <p className="text-xs text-destructive" role="alert">
            {te(state.fieldErrors.email)}
          </p>
        ) : null}
      </div>

      {state.formError ? (
        <p className="text-sm text-destructive" role="alert">
          {state.formError}
        </p>
      ) : null}

      {state.message ? (
        <p className="rounded-lg bg-secondary px-3.5 py-3 text-sm text-secondary-foreground" role="status">
          {state.message}
        </p>
      ) : null}

      <TurnstileWidget onVerify={setCaptchaToken} resetKey={state} />

      <Button type="submit" size="md" isLoading={isPending} disabled={TURNSTILE_ENABLED && !captchaToken} className="w-full">
        {t('submit')}
      </Button>
    </form>
  );
}
