import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Create a pre-confirmed auth user plus their profile row (the email-delivery
 * bypass path — see EMAIL_CONFIRMATION_DISABLED in ./actions). Shared by the
 * sign-up form and the multi-account "register a new account" flow so the
 * account-creation logic lives in exactly one place.
 *
 * Does NOT establish a session — the caller signs in afterwards so the cookie
 * is bound to the right client.
 */
export type CreateAccountResult =
  | { ok: true; userId: string }
  | { ok: false; usernameTaken: true }
  | { ok: false; errorMessage: string };

export async function createConfirmedAccount(
  email: string,
  password: string,
  username: string,
  avatarUrl: string,
  birthDate: string | null = null,
): Promise<CreateAccountResult> {
  const admin = createAdminClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // mark confirmed → no confirmation email is sent
  });
  if (error || !created?.user) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[createConfirmedAccount] createUser error:', error?.message);
    }
    return { ok: false, errorMessage: error?.message ?? 'create_failed' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: profileError } = await (admin as any)
    .from('profiles')
    .insert({ id: created.user.id, username, avatar_url: avatarUrl, birth_date: birthDate });

  if (profileError) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[createConfirmedAccount] profile insert error:', profileError.message);
    }
    // Username lost a race — roll back the just-created auth user so its email
    // isn't orphaned and can be reused.
    if (profileError.code === '23505') {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return { ok: false, usernameTaken: true };
    }
    // Any other profile error is non-fatal: the auth user exists and the
    // profile can be completed later; don't block sign-in.
  }

  return { ok: true, userId: created.user.id };
}
