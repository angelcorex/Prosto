import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/utils/env';
import type { Database } from './database.types';

/**
 * Service-role Supabase client — bypasses RLS. Use only in trusted server code
 * (route handlers, server actions) for operations the user cannot perform under
 * their own session, e.g. reading another user's connection tokens to fetch
 * their Spotify "now playing". Never import this into client components.
 */
export function createAdminClient() {
  return createClient<Database>(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
