import { cookies } from 'next/headers';
import { cache } from 'react';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

import { env } from '@/lib/utils/env';
import type { Database } from './database.types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server Supabase client for use in Server Components, Route Handlers and
 * Server Actions.
 *
 * Cookie writes are wrapped in try/catch because Server Components cannot set
 * cookies — in that context, session refresh is handled by middleware instead
 * (see `src/lib/supabase/middleware.ts`).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * Cached current user — dedupes `auth.getUser()` across layout, sidebar and
 * page within a single request render pass. Without this, each component that
 * needs the user triggers its own round-trip to the Supabase auth server.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    // Benign "refresh_token_not_found" for logged-out visitors / expired token.
    return null;
  }
});

/**
 * Cached current user's profile — dedupes the profiles lookup across the
 * layout and DM sidebar within one render pass.
 */
export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  // birth_date is PII (exact DOB) and is NOT selected here — column-level SELECT
  // on it is revoked from the client roles (see migration 124). Read it via the
  // get_my_birth_date() DEFINER accessor instead, in parallel with the profile.
  const [profileRes, birthDate] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('profiles')
      .select('id, username, avatar_url, banner_url, display_name, pronouns, bio, is_verified, is_moderator, is_premium, is_admin, status, last_seen')
      .eq('id', user.id)
      .maybeSingle(),
    getOwnBirthDate(supabase),
  ]);
  const data = profileRes.data;
  if (!data) return null;
  return { ...data, birth_date: birthDate };
});

/**
 * The viewer's own birth date (`yyyy-mm-dd`) or null. PII: read only via the
 * `get_my_birth_date()` SECURITY DEFINER RPC, never by selecting the column
 * (column-level SELECT is revoked from anon/authenticated — see migration 124).
 *
 * Falls back to a direct column read ONLY if the RPC does not exist yet (404),
 * so the app keeps working if code is deployed before the migration is applied.
 * Once the migration lands, the RPC exists and the fallback is never taken.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOwnBirthDate(supabase: any, userId?: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_birth_date');
  if (!error) return (data as string | null) ?? null;
  // PGRST202 = function not found in schema cache (migration not applied yet).
  if (error.code === 'PGRST202' || /function .*get_my_birth_date/i.test(error.message ?? '')) {
    let uid = userId;
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      uid = user?.id;
    }
    if (!uid) return null;
    const { data: row } = await supabase
      .from('profiles').select('birth_date').eq('id', uid).maybeSingle();
    return (row?.birth_date as string | null) ?? null;
  }
  // Any other error (incl. the expected 403 once the column is locked but the
  // RPC somehow failed) → treat as "unknown", which safely gates NSFW content.
  return null;
}
