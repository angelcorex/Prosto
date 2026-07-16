'use client';

import { useActionState } from 'react';

import { useT } from '@/providers/i18n-provider';
import { Button, Label, PasswordInput } from '@/components/ui';
import { updateRecoveryPassword } from '../api/email-auth';
import { initialAuthState } from '../types';
import { PASSWORD_MIN_LENGTH } from '../validation';

export function ResetPasswordForm() {
  const t = useT('auth.reset');
  const te = useT('auth.errors');
  const [state, formAction, isPending] = useActionState(updateRecoveryPassword, initialAuthState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t('newPassword')}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder={t('newPasswordPlaceholder', { min: PASSWORD_MIN_LENGTH })}
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
        {state.fieldErrors?.password ? (
          <p className="text-xs text-destructive" role="alert">
            {te(state.fieldErrors.password, { min: PASSWORD_MIN_LENGTH })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
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
        <p className="text-sm text-destructive" role="alert">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" size="md" isLoading={isPending} className="w-full">
        {t('submit')}
      </Button>
    </form>
  );
}
