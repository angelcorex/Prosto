'use client';

import { useActionState, useState } from 'react';

import { useT } from '@/providers/i18n-provider';
import { Button, Input, Label } from '@/components/ui';
import { loginWithCode } from '../api/email-auth';
import { initialAuthState } from '../types';
import { TurnstileWidget, TURNSTILE_ENABLED } from './turnstile-widget';

export function CodeLoginForm({ next }: { next?: string }) {
  const t = useT('auth.code');
  const tf = useT('auth.fields');
  const te = useT('auth.errors');
  const [state, formAction, isPending] = useActionState(loginWithCode, initialAuthState);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const onCodeStep = state.step === 'code';

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{tf('email')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={tf('emailPlaceholder')}
          defaultValue={state.email}
          readOnly={onCodeStep}
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
        {state.fieldErrors?.email ? (
          <p className="text-xs text-destructive" role="alert">
            {te(state.fieldErrors.email)}
          </p>
        ) : null}
      </div>

      {onCodeStep ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">{t('codeLabel')}</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={t('codePlaceholder')}
            maxLength={8}
            autoFocus
            aria-invalid={Boolean(state.fieldErrors?.password)}
          />
          {state.fieldErrors?.password ? (
            <p className="text-xs text-destructive" role="alert">
              {te('invalidCode')}
            </p>
          ) : null}
        </div>
      ) : null}

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

      {!onCodeStep ? <TurnstileWidget onVerify={setCaptchaToken} resetKey={state} /> : null}

      <Button type="submit" size="md" isLoading={isPending} disabled={!onCodeStep && TURNSTILE_ENABLED && !captchaToken} className="w-full">
        {onCodeStep ? t('verify') : t('sendCode')}
      </Button>
    </form>
  );
}
