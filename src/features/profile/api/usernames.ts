'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { validateUsernameFormat, normalizeUsername } from '@/features/auth/username-rules';

/**
 * Additional usernames (Super Prosto handle aliases).
 *
 * Thin wrappers over the security-definer RPCs (add_username / remove_username /
 * list_my_usernames) which enforce premium, the per-account limit, format and
 * global uniqueness in the database. The action maps RPC error codes to i18n
 * keys under `settings.usernames.errors.*` so the UI stays localized.
 */

export interface UsernameActionResult {
  ok?: boolean;
  /** i18n key under settings.usernames.errors, set on failure. */
  error?: string;
}

/** DB `raise exception '<code>'` messages → i18n error keys. */
function errorKey(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('not_premium')) return 'notPremium';
  if (m.includes('limit_reached')) return 'limitReached';
  if (m.includes('username_taken')) return 'taken';
  if (m.includes('invalid_format')) return 'invalidFormat';
  return 'generic';
}

/** Claim an additional username for the current user. */
export async function addUsername(rawUsername: string): Promise<UsernameActionResult> {
  const username = normalizeUsername(rawUsername);

  const format = validateUsernameFormat(username);
  if (!format.ok) return { error: 'invalidFormat' };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('add_username', { p_username: username });

  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[addUsername]', error.message);
    return { error: errorKey(String(error.message ?? '')) };
  }

  revalidatePath('/settings/profile');
  return { ok: true };
}

/** Release one of the current user's additional usernames. */
export async function removeUsername(rawUsername: string): Promise<UsernameActionResult> {
  const username = normalizeUsername(rawUsername);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('remove_username', { p_username: username });

  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[removeUsername]', error.message);
    return { error: 'generic' };
  }

  revalidatePath('/settings/profile');
  return { ok: true };
}
