'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLocale, getT } from '@/lib/i18n';
import { sendEmail, otpEmail, recoveryEmail } from '@/lib/email';
import { site } from '@/config';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { validateEmailAddress } from '../email-rules';
import { PASSWORD_MIN_LENGTH } from '../validation';
import type { AuthFormState } from '../types';

/** Only allow same-site relative redirects (block //evil.com and absolute URLs). */
function safeNext(value: FormDataEntryValue | null): string | null {
  const n = String(value ?? '');
  if (n.startsWith('/') && !n.startsWith('//')) return n;
  return null;
}

/** Origin derived from the incoming request, so links work in dev and prod. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('host');
  if (!host) return site.url;
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

async function emailLocale(): Promise<'en' | 'ru'> {
  return (await getLocale()) === 'ru' ? 'ru' : 'en';
}

/**
 * Code-login (passwordless). One action drives both steps:
 *  - no `code` field  → generate + email a one-time code (step "code").
 *  - `code` present   → verify it and create a session.
 *
 * For privacy we always advance to the code step and show the same message,
 * whether or not an account exists — an email is only actually sent when the
 * address is registered.
 */
export async function loginWithCode(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const code = String(formData.get('code') ?? '').trim();
  const te = await getT('auth.errors');
  const tm = await getT('auth.messages');

  // ── Step 2: verify the entered code ──────────────────────────────────────
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) {
      return { step: 'code', email, fieldErrors: { password: 'invalidCode' } };
    }
    revalidatePath('/', 'layout');
    redirect(safeNext(formData.get('next')) ?? site.routes.feed);
  }

  // ── Step 1: validate the email, then generate + send the code ────────────
  const emailError = email ? validateEmailAddress(email) : 'emailRequired';
  if (emailError) {
    return { step: 'email', email, fieldErrors: { email: emailError } };
  }

  // Bot check (Cloudflare Turnstile) — no-op until TURNSTILE_SECRET_KEY is set.
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? '')))) {
    return { step: 'email', email, formError: te('captchaFailed') };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });

    if (error) {
      console.error('[loginWithCode] generateLink failed:', error.message);
      if (/not found|no user|not registered/i.test(error.message)) {
        return { step: 'email', email, fieldErrors: { email: 'noAccount' } };
      }
      return {
        step: 'email',
        email,
        formError: process.env.NODE_ENV === 'development' ? `[dev] ${error.message}` : te('generic'),
      };
    }

    const otp = data?.properties?.email_otp;
    if (!otp) return { step: 'email', email, formError: te('generic') };

    const locale = await emailLocale();
    const { subject, html, text } = otpEmail(otp, locale);
    await sendEmail({ to: email, subject, html, text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[loginWithCode] send failed:', msg);
    return {
      step: 'email',
      email,
      formError: process.env.NODE_ENV === 'development' ? `[dev] ${msg}` : te('generic'),
    };
  }

  return { step: 'code', email, message: tm('codeSent') };
}

/**
 * Forgot-password: email a reset link. The link points at our own
 * `/auth/confirm` route (token-hash exchange), so it works under the SSR/PKCE
 * cookie flow without relying on Supabase's redirect allowlist.
 *
 * Always returns the same generic message to avoid leaking which emails exist.
 */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const te = await getT('auth.errors');
  const tm = await getT('auth.messages');

  const emailError = email ? validateEmailAddress(email) : 'emailRequired';
  if (emailError) {
    return { fieldErrors: { email: emailError } };
  }

  // Bot check (Cloudflare Turnstile) — no-op until TURNSTILE_SECRET_KEY is set.
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? '')))) {
    return { formError: te('captchaFailed') };
  }

  try {
    const origin = await requestOrigin();
    const redirectTo = `${origin}${site.routes.resetPassword}`;
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    if (error) {
      console.error('[requestPasswordReset] generateLink failed:', error.message);
      if (/not found|no user|not registered/i.test(error.message)) {
        return { fieldErrors: { email: 'noAccount' } };
      }
      return { formError: process.env.NODE_ENV === 'development' ? `[dev] ${error.message}` : te('generic') };
    }

    const hash = data?.properties?.hashed_token;
    if (!hash) return { formError: te('generic') };

    const confirmUrl =
      `${origin}${site.routes.authConfirm}` +
      `?token_hash=${encodeURIComponent(hash)}&type=recovery` +
      `&next=${encodeURIComponent(site.routes.resetPassword)}`;
    const locale = await emailLocale();
    const { subject, html, text } = recoveryEmail(confirmUrl, locale);
    await sendEmail({ to: email, subject, html, text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[requestPasswordReset] send failed:', msg);
    return { formError: process.env.NODE_ENV === 'development' ? `[dev] ${msg}` : te('generic') };
  }

  return { message: tm('resetLinkSent') };
}

/**
 * Set a new password during a recovery session (after the user followed the
 * reset link and `/auth/confirm` established the session).
 */
export async function updateRecoveryPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');
  const t = await getT('auth.errors');

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { fieldErrors: { password: 'passwordTooShort' } };
  }
  if (password !== confirm) {
    return { fieldErrors: { confirmPassword: 'passwordMismatch' } };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { formError: t('recoverySessionExpired') };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { formError: t('generic') };
  }

  // Invalidate any other sessions so a leaked token can't outlive the reset.
  await supabase.auth.signOut({ scope: 'others' });
  revalidatePath('/', 'layout');
  redirect(site.routes.feed);
}
