'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n';
import { site } from '@/config';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { upsertAccount, clearAccounts } from '@/lib/accounts/store';
import { hasErrors, validateCredentials, PASSWORD_MIN_LENGTH } from '../validation';
import { validateUsernameFormat, normalizeUsername } from '../username-rules';
import { createConfirmedAccount } from './create-account';
import { ageFromBirthDate, MIN_SIGNUP_AGE } from '@/lib/utils/age';
import type { AuthFormState } from '../types';

/**
 * TEMPORARY: the transactional email service is down, so email confirmation is
 * bypassed for new sign-ups. Accounts are created pre-confirmed via the admin
 * API (no confirmation email is sent) and the user is signed in immediately.
 *
 * To restore email confirmation: set this to `false` and re-enable
 * "Confirm email" in the Supabase Auth settings.
 */
const EMAIL_CONFIRMATION_DISABLED: boolean = true;

/** Only allow same-site relative redirects (block //evil.com and absolute URLs). */
function safeNext(value: FormDataEntryValue | null): string | null {
  const n = String(value ?? '');
  if (n.startsWith('/') && !n.startsWith('//')) return n;
  return null;
}

function getAuthErrorKey(message: string): string {
  const n = message.toLowerCase();
  if (n.includes('invalid login credentials') || n.includes('invalid credentials')) return 'invalidCredentials';
  if (n.includes('already registered') || n.includes('already been registered') || n.includes('user already registered')) return 'alreadyRegistered';
  if (n.includes('email not confirmed')) return 'emailNotConfirmed';
  if (n.includes('email rate limit') || n.includes('rate limit')) return 'rateLimited';
  return 'generic';
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email    = String(formData.get('email')    ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const rawUsername = String(formData.get('username') ?? '');
  const username = normalizeUsername(rawUsername);
  const birthDate = String(formData.get('birth_date') ?? '').trim();

  // Chosen default avatar (must be one of the built-in defaults). Falls back to
  // the first default so a new account never starts with an empty placeholder.
  const DEFAULT_AVATARS = [
    '/material/avatars/default/avatar1.webp',
    '/material/avatars/default/avatar2.webp',
  ];
  const pickedAvatar = String(formData.get('avatar_url') ?? '');
  const avatarUrl = DEFAULT_AVATARS.includes(pickedAvatar) ? pickedAvatar : DEFAULT_AVATARS[0]!;

  // Bot check (Cloudflare Turnstile) — no-op until TURNSTILE_SECRET_KEY is set.
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? '')))) {
    const te = await getT('auth.errors');
    return { formError: te('captchaFailed') };
  }

  // 1. Validate email + password
  const fieldErrors = validateCredentials(email, password);

  // 2. Validate username format
  if (!username) {
    fieldErrors.username = 'usernameRequired';
  } else {
    const fmt = validateUsernameFormat(username);
    if (!fmt.ok) fieldErrors.username = fmt.key;
  }

  // 3. Require explicit agreement to the legal documents.
  if (formData.get('agree') !== 'yes') {
    fieldErrors.agree = 'mustAgree';
  }

  // 3b. Require a valid date of birth (minimum age enforced by the DB too).
  const signUpAge = ageFromBirthDate(birthDate);
  if (!birthDate || signUpAge == null) {
    fieldErrors.birthDate = 'signUpRequired';
  } else if (signUpAge < MIN_SIGNUP_AGE) {
    fieldErrors.birthDate = 'signUpTooYoung';
  }

  if (hasErrors(fieldErrors)) return { fieldErrors };

  const supabase = await createClient();

  // 3. Check username availability
  const { data: existing } = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('username' as any)
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    return { fieldErrors: { username: 'usernameTaken' } };
  }

  // 4. Create the account — auto-confirmed while email delivery is down.
  if (EMAIL_CONFIRMATION_DISABLED) {
    const created = await createConfirmedAccount(email, password, username, avatarUrl, birthDate);
    if (!created.ok) {
      if ('usernameTaken' in created) {
        return { fieldErrors: { username: 'usernameTaken' } };
      }
      const t = await getT('auth.errors');
      const key = getAuthErrorKey(created.errorMessage);
      const msg = key === 'generic' && process.env.NODE_ENV === 'development'
        ? `[dev] ${created.errorMessage}`
        : t(key);
      return { formError: msg };
    }

    // Establish the session on the cookie-bound client.
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !signInData.session) {
      const t = await getT('auth.errors');
      return { formError: t('generic') };
    }
    // Track this account on the device so it appears in the account switcher.
    await upsertAccount(created.userId, signInData.session.refresh_token);

    revalidatePath('/', 'layout');
    redirect(safeNext(formData.get('next')) ?? site.routes.home);
  }

  // 4b. Standard flow (email confirmation enabled).
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[signUp] Supabase error:', error.message, error.status);
    }
    const t = await getT('auth.errors');
    const key = getAuthErrorKey(error.message);
    const msg = key === 'generic' && process.env.NODE_ENV === 'development'
      ? `[dev] ${error.message}`
      : t(key);
    return { formError: msg };
  }

  // 5. Insert profile row (best-effort — if email confirmation is on,
  //    the user isn't active yet so we insert with the new user id)
  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ id: data.user.id, username, avatar_url: avatarUrl, birth_date: birthDate } as any);

    if (profileError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[signUp] Profile insert error:', profileError.message);
      }
      // Username taken at DB level (race condition)
      if (profileError.code === '23505') {
        return { fieldErrors: { username: 'usernameTaken' } };
      }
    }
  }

  // 6. Email confirmation required
  if (!data.session) {
    const t = await getT('auth.messages');
    return { message: t('confirmEmail') };
  }

  revalidatePath('/', 'layout');
  redirect(safeNext(formData.get('next')) ?? site.routes.home);
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email    = String(formData.get('email')    ?? '').trim();
  const password = String(formData.get('password') ?? '');

  // Bot check (Cloudflare Turnstile) — no-op until TURNSTILE_SECRET_KEY is set.
  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? '')))) {
    const te = await getT('auth.errors');
    return { formError: te('captchaFailed') };
  }

  const fieldErrors = validateCredentials(email, password);
  if (hasErrors(fieldErrors)) return { fieldErrors };

  const supabase = await createClient();

  // Anti-brute-force: refuse if this email is in a failed-attempt cooldown.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cooldown } = await (supabase as any).rpc('login_cooldown', { p_email: email });
  if (typeof cooldown === 'number' && cooldown > 0) {
    const te = await getT('auth.errors');
    return { formError: te('tooManyAttempts', { seconds: cooldown }) };
  }

  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Count the failure toward the cooldown.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('note_login_failure', { p_email: email });

    if (process.env.NODE_ENV === 'development') {
      console.error('[signIn] Supabase error:', error.message, error.status);
    }
    const t = await getT('auth.errors');
    const key = getAuthErrorKey(error.message);
    const msg = key === 'generic' && process.env.NODE_ENV === 'development'
      ? `[dev] ${error.message}`
      : t(key);
    return { formError: msg };
  }

  // Success → clear the failure counter for this email.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('clear_login_failures', { p_email: email });

  // Track this account on the device so it appears in the account switcher.
  if (signInData.user && signInData.session) {
    await upsertAccount(signInData.user.id, signInData.session.refresh_token);
  }

  revalidatePath('/', 'layout');
  redirect(safeNext(formData.get('next')) ?? site.routes.home);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Full sign-out: forget every account kept on this device...
  await clearAccounts();
  // ...and revoke every refresh token for the current user (other tabs,
  // devices, or a token grabbed from the console) — not just this browser.
  await supabase.auth.signOut({ scope: 'global' });
  revalidatePath('/', 'layout');
  redirect(site.routes.signIn);
}

/**
 * Permanently delete the signed-in user's account and all of their data.
 *
 * The current password is verified first (an irreversible action shouldn't run
 * off a stale session). Deletion itself is a single `delete_my_account` RPC:
 * it removes the auth.users row and the database cascades everything else
 * (profile, posts, messages, friendships, etc.). Then we sign out and redirect.
 */
export async function deleteAccount(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get('password') ?? '');
  const t = await getT('auth.errors');

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) {
    return { formError: t('generic') };
  }

  // Confirm identity with the current password before destroying anything.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (verifyError) {
    return { fieldErrors: { password: 'invalidCredentials' } };
  }

  // delete_my_account isn't in the generated DB types; cast to call it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: deleteError } = await (supabase as any).rpc('delete_my_account');
  if (deleteError) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[deleteAccount] RPC error:', deleteError.message);
    }
    return { formError: t('generic') };
  }

  await clearAccounts();
  await supabase.auth.signOut({ scope: 'global' });
  revalidatePath('/', 'layout');
  redirect(site.routes.signIn);
}

/**
 * Change the signed-in user's password and invalidate every other session.
 *
 * Supabase rotates the user's tokens on password update; we additionally sign
 * out all *other* sessions so a leaked token can no longer be used after a
 * password change. The current session stays valid (the user keeps working).
 */
export async function changePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const current  = String(formData.get('currentPassword') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm  = String(formData.get('confirmPassword') ?? '');

  const t = await getT('auth.errors');

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { fieldErrors: { password: 'passwordTooShort' } };
  }
  if (password !== confirm) {
    return { fieldErrors: { confirmPassword: 'passwordMismatch' } };
  }

  const supabase = await createClient();

  // Verify the current password before allowing a change.
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) {
    return { formError: t('generic') };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: current,
  });
  if (verifyError) {
    return { fieldErrors: { currentPassword: 'invalidCredentials' } };
  }

  // Update the password (rotates the current session's tokens).
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { formError: t('generic') };
  }

  // Kill every *other* session so any leaked token is now useless.
  await supabase.auth.signOut({ scope: 'others' });

  revalidatePath('/', 'layout');

  const tm = await getT('auth.messages');
  return { message: tm('passwordChanged') };
}
