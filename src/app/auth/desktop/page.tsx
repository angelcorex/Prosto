'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { site } from '@/config';

/** Only allow same-site relative redirects (block //evil.com and absolute URLs). */
function safeNext(value: string | null): string {
  const n = String(value ?? '');
  return n.startsWith('/') && !n.startsWith('//') ? n : site.routes.home;
}

/**
 * Desktop OAuth completion page (WebView only). The provider ran in the user's
 * system browser; the callback bounced back into the app via a `prosto://` deep
 * link, which the Rust shell turned into a navigation here carrying the code as
 * `?c=…`. This is the ONE context that holds the PKCE verifier cookie, so the
 * exchange must happen here — the server route never sees the verifier on the
 * desktop path.
 *
 * The code is read from `c` (not `code`) so supabase-js's `detectSessionInUrl`
 * doesn't auto-consume the single-use code before we exchange it explicitly.
 * On success we hand off to `/auth/callback?finalize=1` (server-side) to
 * provision the profile and set the account-switcher cookie, then land in-app.
 * On failure we show the reason instead of silently bouncing to sign-in.
 */
function DesktopAuthInner() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // React 18 StrictMode double-invokes effects in dev; the code is single-use,
    // so guard against a second exchange that would fail with "code already used".
    if (ran.current) return;
    ran.current = true;

    const code = params.get('c');
    const next = safeNext(params.get('next'));

    if (!code) {
      setError('Не получен код авторизации. Попробуйте войти ещё раз.');
      return;
    }

    (async () => {
      try {
        const sb = createClient();
        const { error: exErr } = await sb.auth.exchangeCodeForSession(code);
        if (exErr) {
          // The desktop shell can deliver the prosto:// deep link twice on
          // Windows (once via single-instance argv, once via the deep-link
          // listener). If a rival navigation already exchanged this code, the
          // second exchange fails ("code already used" / verifier gone) even
          // though we ARE signed in. Treat an existing session as success
          // instead of showing an error over a completed login.
          const { data: { session } } = await sb.auth.getSession();
          if (!session) {
            setError(exErr.message || 'Не удалось завершить вход.');
            return;
          }
        }
        // Full-document navigation so the freshly-written session cookies reach
        // the server, which finalizes provisioning and redirects into the app.
        window.location.assign(
          `/auth/callback?finalize=1&next=${encodeURIComponent(next)}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось завершить вход.');
      }
    })();
  }, [params]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        {error ? (
          <>
            <h1 className="mb-2 text-lg font-bold text-foreground">Не удалось войти</h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{error}</p>
            <a
              href={site.routes.signIn}
              className="inline-block rounded-xl bg-foreground px-6 py-2.5 text-sm font-semibold text-background"
            >
              Вернуться ко входу
            </a>
          </>
        ) : (
          <>
            <span className="mx-auto mb-4 block h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Завершаем вход…</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function DesktopAuthPage() {
  return (
    <Suspense fallback={null}>
      <DesktopAuthInner />
    </Suspense>
  );
}
