'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { useT } from '@/providers/i18n-provider';
import { maxBirthDateFor, MIN_SIGNUP_AGE } from '@/lib/utils/age';
import { DatePicker } from '@/features/age';
import { Button } from '@/components/ui';
import { DefaultAvatarPicker, DEFAULT_AVATARS } from '@/features/profile';
import { site } from '@/config';
import { signUp } from '../api/actions';
import { initialAuthState } from '../types';
import { CredentialsFields } from './credentials-fields';
import { UsernameField } from './username-field';
import { TurnstileWidget, TURNSTILE_ENABLED } from './turnstile-widget';
import { OAuthButtons } from './oauth-buttons';

export function SignUpForm({ next }: { next?: string }) {
  const t = useT('auth.signUp');
  const te = useT('auth.errors');
  const ta = useT('age');
  const [state, formAction, isPending] = useActionState(signUp, initialAuthState);
  const [avatarUrl, setAvatarUrl] = useState<string>(DEFAULT_AVATARS[0]);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {/* Username — first so it gets focus */}
      <UsernameField error={state.fieldErrors?.username} />

      {/* Email + password */}
      <CredentialsFields errors={state.fieldErrors} />

      {/* Date of birth — required, minimum age enforced server-side */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">{ta('signUpLabel')}</label>
        <DatePicker
          name="birth_date"
          value={birthDate || null}
          max={maxBirthDateFor(MIN_SIGNUP_AGE)}
          onChange={setBirthDate}
        />
        {state.fieldErrors?.birthDate ? (
          <p className="text-xs text-destructive" role="alert">{ta(state.fieldErrors.birthDate)}</p>
        ) : null}
      </div>

      {/* Default avatar choice */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t('chooseAvatar')}</p>
        <DefaultAvatarPicker value={avatarUrl} onChange={setAvatarUrl} size="sm" />
        <input type="hidden" name="avatar_url" value={avatarUrl} />
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

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            name="agree"
            value="yes"
            className="mt-0.5 h-4 w-4 shrink-0 accent-link"
            aria-invalid={Boolean(state.fieldErrors?.agree)}
          />
          <span>
            {t('terms')}{' '}
            <Link href={site.routes.legal.terms} target="_blank" className="text-link hover:underline">
              {t('termsLink')}
            </Link>
            ,{' '}
            <Link href={site.routes.legal.privacy} target="_blank" className="text-link hover:underline">
              {t('privacyLink')}
            </Link>{' '}
            {t('and')}{' '}
            <Link href={site.routes.legal.guidelines} target="_blank" className="text-link hover:underline">
              {t('guidelinesLink')}
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.agree ? (
          <p className="text-xs text-destructive" role="alert">
            {te('mustAgree')}
          </p>
        ) : null}
      </div>

      <TurnstileWidget onVerify={setCaptchaToken} resetKey={state} />

      <Button type="submit" size="md" isLoading={isPending} disabled={TURNSTILE_ENABLED && !captchaToken} className="w-full">
        {t('submit')}
      </Button>

      <OAuthButtons next={next} />
    </form>
  );
}
