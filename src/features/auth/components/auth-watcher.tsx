'use client';

import { useEffect, useRef } from 'react';

import { createClient, getBrowserUser } from '@/lib/supabase/client';
import { site } from '@/config';

/**
 * Global auth-state guard.
 *
 * Listens for Supabase auth changes in the browser and reacts instantly when
 * the session dies — whether it was ended here, in another tab, on another
 * device, or revoked server-side (e.g. signOut with global scope, or a
 * password change that rotates tokens). On sign-out it pushes the user to the
 * sign-in page and refreshes server components so nothing stale stays on screen.
 *
 * Mount once, high in the authenticated tree.
 */
export function AuthWatcher() {
  const handled = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const kick = () => {
      if (handled.current) return;
      handled.current = true;
      // Hard navigation (not router.replace + router.refresh): a full document
      // load to the sign-in page avoids racing with the sign-out server action,
      // which also revalidates the layout and redirects. That race re-fetched
      // the now-unauthorized RSC and briefly flashed "This page couldn't load".
      // A full load also guarantees all in-memory client state is cleared.
      window.location.replace(site.routes.signIn);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) {
        kick();
      }
    });

    // Catch tokens revoked elsewhere (e.g. killed from the console / another
    // device) that don't fire an event right away: re-validate against the
    // server when the tab regains focus and on a slow interval. `force` bypasses
    // the shared getUser cache so this always hits the server (its whole job).
    const verify = async () => {
      const user = await getBrowserUser(true);
      if (!user) kick();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void verify();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => void verify(), 60_000);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, []);

  return null;
}
