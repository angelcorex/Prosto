'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { useT } from '@/providers/i18n-provider';
import { Button } from '@/components/ui';
import { site } from '@/config';
import { signIn } from '../api/actions';
import { initialAuthState } from '../types';
import { CredentialsFields } from './credentials-fields';
import { TurnstileWidget, TURNSTILE_ENABLED } from './turnstile-widget';
import { OAuthButtons } from './oauth-buttons';

export function SignInForm({ next }: { next?: string }) {
  const t = useT('auth.signIn');
  const [state, formAction, isPending] = useActionState(signIn, initialAuthState);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const withNext = (path: string) =>
    next ? `${path}?next=${encodeURIComponent(next)}` : path;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <CredentialsFields errors={state.fieldErrors} />

      {state.formError ? (
        <p className="text-sm text-destructive" role="alert">
          {state.formError}
        </p>
      ) : null}

      <TurnstileWidget onVerify={setCaptchaToken} resetKey={state} />

      <Button type="submit" size="md" isLoading={isPending} disabled={TURNSTILE_ENABLED && !captchaToken} className="w-full">
        {t('submit')}
      </Button>

      <OAuthButtons next={next} />

      <div className="flex items-center justify-between text-xs">
        <Link href={withNext(site.routes.signInCode)} className="font-medium text-link hover:underline">
          {t('useCode')}
        </Link>
        <Link href={site.routes.forgotPassword} className="text-muted-foreground hover:underline">
          {t('forgotPassword')}
        </Link>
      </div>
    </form>
  );
}
