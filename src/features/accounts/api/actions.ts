'use server';

import { revalidatePath } from 'next/cache';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/utils/env';
import { getT } from '@/lib/i18n';
import { site } from '@/config';
import { verifyTurnstile } from '@/lib/security/turnstile';
import {
  readAccounts,
  upsertAccount,
  removeAccount as removeStored,
  getStoredAccount,
  clearAccounts,
  MAX_ACCOUNTS,
} from '@/lib/accounts/store';
import { hasErrors, validateCredentials } from '@/features/auth/validation';
import { validateUsernameFormat, normalizeUsername } from '@/features/auth/username-rules';
import { createConfirmedAccount } from '@/features/auth/api/create-account';
import type { AccountSummary, AddAccountState } from '../types';

/**
 * Multi-account switching (Discord/Twitter style).
 *
 * Security model:
 *  - Inactive accounts' refresh tokens live only in an encrypted, HttpOnly
 *    cookie (see `@/lib/accounts/store`) — never exposed to the client.
 *  - Every switch mints a fresh session via `refreshSession`, which ROTATES the
 *    refresh token; the new token replaces the stored one.
 *  - The active account's live token is re-synced into the store before we
 *    leave it, so a later switch back never uses a stale token.
 *  - Passwords are verified by Supabase (server-side Argon2/bcrypt); we never
 *    handle password hashes here.
 */

/**
 * Verify an account's credentials WITHOUT touching the active session cookie.
 *
 * supabase-js's `signInWithPassword` clears the stored session on failure, so
 * authenticating the new account on the cookie-bound client would log the
 * *current* user out on a wrong password. We use a throwaway, non-persisting
 * client and only install the resulting session (via `setSession`) once it
 * succeeds — the active session is never disturbed by a failed attempt.
 */
async function authenticate(email: string, password: string) {
  const ephemeral = createSupabaseClient(env.supabase.url, env.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return ephemeral.auth.signInWithPassword({ email, password });
}

/** List the accounts stored on this device for the switcher (no tokens). */
export async function listAccounts(): Promise<{ accounts: AccountSummary[]; activeId: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const activeId = user?.id ?? null;

  const stored = await readAccounts();

  // Self-heal: ensure the currently-active account is tracked (e.g. a session
  // that predates this feature, or after the store was cleared).
  if (activeId && !stored.some((a) => a.id === activeId)) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.refresh_token) {
      await upsertAccount(activeId, session.refresh_token);
      stored.push({ id: activeId, rt: session.refresh_token });
    }
  }

  const ids = stored.map((a) => a.id);
  if (ids.length === 0) return { accounts: [], activeId };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_verified, is_premium, is_moderator')
    .in('id', ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, any>((Array.isArray(data) ? data : []).map((p: any) => [p.id, p]));

  const accounts: AccountSummary[] = stored
    .map((a): AccountSummary | null => {
      const p = byId.get(a.id);
      if (!p || !p.username) return null;
      return {
        id: a.id,
        username: p.username,
        display_name: p.display_name ?? null,
        avatar_url: p.avatar_url ?? null,
        is_verified: !!p.is_verified,
        is_premium: !!p.is_premium,
        is_moderator: !!p.is_moderator,
      };
    })
    .filter((a): a is AccountSummary => a !== null);

  // Keep the active account first for a stable, predictable list.
  accounts.sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0));
  return { accounts, activeId };
}

/** Switch the active session to another stored account. Client reloads on ok. */
export async function switchAccount(targetId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Re-sync the active account's live token before leaving it.
  if (user?.id) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.refresh_token) await upsertAccount(user.id, session.refresh_token);
    if (user.id === targetId) return { ok: true };
  }

  const target = await getStoredAccount(targetId);
  if (!target) return { ok: false, error: 'not_found' };

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: target.rt });
  if (error || !data.session || !data.user) {
    // Stored token is dead (revoked/expired) → forget this account.
    await removeStored(targetId);
    return { ok: false, error: 'expired' };
  }
  await upsertAccount(data.user.id, data.session.refresh_token); // rotated token
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Add an existing account by logging into it. On success it becomes active. */
export async function addExistingAccount(_prev: AddAccountState, formData: FormData): Promise<AddAccountState> {
  const te = await getT('auth.errors');
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? '')))) {
    return { error: te('captchaFailed') };
  }
  const fieldErrors = validateCredentials(email, password);
  if (hasErrors(fieldErrors)) return { fieldErrors };

  const supabase = await createClient();

  // Preserve the currently-active account (re-sync its live token) before the
  // new sign-in overwrites the session cookie.
  const { data: { user: current } } = await supabase.auth.getUser();
  let previousToken: string | null = null;
  if (current?.id) {
    const { data: { session } } = await supabase.auth.getSession();
    previousToken = session?.refresh_token ?? null;
    if (previousToken) await upsertAccount(current.id, previousToken);
  }

  // Anti-brute-force cooldown (shared with the sign-in page).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cooldown } = await (supabase as any).rpc('login_cooldown', { p_email: email });
  if (typeof cooldown === 'number' && cooldown > 0) {
    return { error: te('tooManyAttempts', { seconds: cooldown }) };
  }

  const before = await readAccounts();
  // Verify on a throwaway client so a wrong password can't drop the active
  // session (see `authenticate`).
  const { data, error } = await authenticate(email, password);
  if (error || !data.session || !data.user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('note_login_failure', { p_email: email });
    return { fieldErrors: { password: 'invalidCredentials' } };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('clear_login_failures', { p_email: email });

  // Adding a brand-new account beyond the limit — the current session is still
  // intact (we haven't installed the new one), so just refuse.
  const isNew = !before.some((a) => a.id === data.user!.id);
  if (isNew && before.length >= MAX_ACCOUNTS) {
    return { error: te('maxAccounts', { max: MAX_ACCOUNTS }) };
  }

  // Install the verified session into the cookie → the new account is active.
  const { error: setError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError) return { error: te('generic') };

  await upsertAccount(data.user.id, data.session.refresh_token);
  revalidatePath('/', 'layout');
  return { ok: true }; // new account active; the modal hard-reloads
}

/** Register a brand-new account and add it (auto-confirmed while email is down). */
export async function registerAndAddAccount(_prev: AddAccountState, formData: FormData): Promise<AddAccountState> {
  const te = await getT('auth.errors');
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const username = normalizeUsername(String(formData.get('username') ?? ''));

  if (!(await verifyTurnstile(String(formData.get('cf-turnstile-response') ?? '')))) {
    return { error: te('captchaFailed') };
  }
  const fieldErrors = validateCredentials(email, password);
  if (!username) fieldErrors.username = 'usernameRequired';
  else {
    const fmt = validateUsernameFormat(username);
    if (!fmt.ok) fieldErrors.username = fmt.key;
  }
  if (formData.get('agree') !== 'yes') fieldErrors.agree = 'mustAgree';
  if (hasErrors(fieldErrors)) return { fieldErrors };

  const supabase = await createClient();

  // Registration always adds a new account — enforce the ceiling up front.
  const before = await readAccounts();
  if (before.length >= MAX_ACCOUNTS) return { error: te('maxAccounts', { max: MAX_ACCOUNTS }) };

  // Username availability.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle();
  if (existing) return { fieldErrors: { username: 'usernameTaken' } };

  // Preserve the currently-active account before signing in the new one.
  const { data: { user: current } } = await supabase.auth.getUser();
  if (current?.id) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.refresh_token) await upsertAccount(current.id, session.refresh_token);
  }

  const DEFAULT_AVATAR = '/material/avatars/default/avatar1.webp';
  const created = await createConfirmedAccount(email, password, username, DEFAULT_AVATAR);
  if (!created.ok) {
    if ('usernameTaken' in created) return { fieldErrors: { username: 'usernameTaken' } };
    // Surface a helpful message when the e-mail is already taken instead of a
    // generic error (the user probably wants to log in, not register).
    const m = created.errorMessage.toLowerCase();
    if (m.includes('already registered') || m.includes('already been registered') || m.includes('email_exists')) {
      return { fieldErrors: { email: 'alreadyRegistered' } };
    }
    return { error: te('generic') };
  }

  // Verify + install the new session without disturbing the current one.
  const { data, error } = await authenticate(email, password);
  if (error || !data.session || !data.user) return { error: te('generic') };
  const { error: setError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError) return { error: te('generic') };
  await upsertAccount(data.user.id, data.session.refresh_token);
  revalidatePath('/', 'layout');
  return { ok: true }; // new account active; the modal hard-reloads
}

/** Combined submit for the add-account modal (login or register by `mode`). */
export async function submitAddAccount(prev: AddAccountState, formData: FormData): Promise<AddAccountState> {
  return formData.get('mode') === 'register'
    ? registerAndAddAccount(prev, formData)
    : addExistingAccount(prev, formData);
}

/**
 * Remove an account from this device's switcher. Removing the active account
 * logs it out here and switches to another stored account (or signs out if it
 * was the last one).
 */
export async function removeAccount(
  targetId: string,
): Promise<{ ok: true; switched?: boolean; signedOut?: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const activeId = user?.id ?? null;

  if (targetId !== activeId) {
    // Just forget the other account here; its unused token ages out on its own.
    await removeStored(targetId);
    revalidatePath('/', 'layout');
    return { ok: true };
  }

  // Removing the active account = log it out locally, then switch to another.
  await supabase.auth.signOut({ scope: 'local' });
  const remaining = await removeStored(targetId);
  const next = remaining[0];
  if (next) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: next.rt });
    if (!error && data.session && data.user) {
      await upsertAccount(data.user.id, data.session.refresh_token);
      revalidatePath('/', 'layout');
      return { ok: true, switched: true };
    }
    await removeStored(next.id); // dead token — drop it
  }
  await clearAccounts();
  revalidatePath('/', 'layout');
  return { ok: true, signedOut: true };
}

/**
 * Log out of the current account: revoke this device's session, drop it from
 * the switcher, and switch to another stored account if there is one — else go
 * to the sign-in page. (Used by the account menu's "Log out" entry.)
 */
export async function logoutCurrentAccount(): Promise<{ to: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.auth.signOut({ scope: 'local' });
  const remaining = user?.id ? await removeStored(user.id) : await readAccounts();
  const next = remaining[0];
  if (next) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: next.rt });
    if (!error && data.session && data.user) {
      await upsertAccount(data.user.id, data.session.refresh_token);
      revalidatePath('/', 'layout');
      return { to: site.routes.home };
    }
    await removeStored(next.id);
  }
  await clearAccounts();
  revalidatePath('/', 'layout');
  // The caller hard-reloads to this destination so the account-hygiene guard in
  // the app layout runs and wipes the logged-out account's local state.
  return { to: site.routes.signIn };
}
