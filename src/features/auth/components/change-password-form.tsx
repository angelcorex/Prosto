'use client';

import { useActionState, useEffect, useRef } from 'react';

import { useT } from '@/providers/i18n-provider';
import { Button, Label, PasswordInput } from '@/components/ui';
import { changePassword } from '../api/actions';
import { initialAuthState } from '../types';
import { PASSWORD_MIN_LENGTH } from '../validation';

export function ChangePasswordForm() {
  const t = useT('auth.password');
  const tf = useT('auth.fields');
  const te = useT('auth.errors');
  const tm = useT('auth.messages');
  const [state, formAction, isPending] = useActionState(changePassword, initialAuthState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state.message]);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">{t('current')}</Label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.currentPassword)}
        />
        {state.fieldErrors?.currentPassword ? (
          <p className="text-xs text-destructive" role="alert">
            {te(state.fieldErrors.currentPassword)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t('next')}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder={tf('passwordPlaceholder', { min: PASSWORD_MIN_LENGTH })}
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
        {state.fieldErrors?.password ? (
          <p className="text-xs text-destructive" role="alert">
            {te(state.fieldErrors.password, { min: PASSWORD_MIN_LENGTH })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">{t('confirm')}</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
        />
        {state.fieldErrors?.confirmPassword ? (
          <p className="text-xs text-destructive" role="alert">
            {te(state.fieldErrors.confirmPassword)}
          </p>
        ) : null}
      </div>

      {state.formError ? (
        <p className="text-sm text-destructive" role="alert">{state.formError}</p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-success" role="status">{tm('passwordChanged')}</p>
      ) : null}

      <Button type="submit" size="md" isLoading={isPending} className="w-fit">
        {t('submit')}
      </Button>
    </form>
  );
}
