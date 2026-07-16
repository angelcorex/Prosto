import { createBrowserClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';

import { env } from '@/lib/utils/env';
import type { Database } from './database.types';

/**
 * Browser Supabase client for use in Client Components.
 *
 * Safe to call repeatedly; `@supabase/ssr` manages a singleton internally per
 * browser context. Reads auth state from cookies shared with the server.
 */
export function createClient() {
  return createBrowserClient<Database>(env.supabase.url, env.supabase.anonKey);
}

/**
 * Shared, memoised `auth.getUser()` for client components.
 *
 * Many always-mounted hooks (heartbeat, server rail, DM badges, message
 * notifier…) each called `sb.auth.getUser()` on mount — every call is a
 * network round-trip to the Supabase Auth server, so a single page load fired
 * 5-6 of them at once. This dedupes them into ONE request whose result is
 * cached for the lifetime of the document.
 *
 * Safe to cache: the signed-in identity only changes on sign-out or an account
 * switch, and both paths force a FULL document reload (AuthWatcher →
 * `window.location.replace`, account switch → hard nav), which resets this
 * module. A token refresh keeps the same user id, so the cached value stays
 * correct. Pass `force: true` to bypass the cache when you specifically need to
 * re-validate the session against the server (e.g. AuthWatcher's periodic check).
 */
let cachedUserPromise: Promise<User | null> | null = null;
export function getBrowserUser(force = false): Promise<User | null> {
  if (force) cachedUserPromise = null;
  if (!cachedUserPromise) {
    const sb = createClient();
    cachedUserPromise = sb.auth
      .getUser()
      .then(({ data }) => data.user ?? null)
      .catch(() => {
        // Don't cache a transient failure — let the next caller retry.
        cachedUserPromise = null;
        return null;
      });
  }
  return cachedUserPromise;
}
