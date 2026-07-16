import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

import { env } from '@/lib/utils/env';
import type { Database } from './database.types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Build the Content-Security-Policy for a request, bound to a per-request nonce.
 *
 * Notes on the choices:
 *  - `script-src 'nonce-…' 'strict-dynamic'`: only nonce'd scripts run, and
 *    scripts they load inherit trust (Next's chunk loader needs this). No
 *    `'unsafe-inline'`, so injected inline scripts (XSS) can't execute.
 *  - `style-src 'unsafe-inline'`: Next / Tailwind inject inline styles; style
 *    injection is far lower risk than script injection. Tighten later if desired.
 *  - `img-src`/`media-src`/`connect-src` allow our storage origin, the Supabase
 *    project (REST + realtime websocket), and the GIF providers. Adjust the env
 *    hosts to match production.
 *  - Delivered as Report-Only first (see updateSession) — nothing is blocked
 *    until we flip the header name after validating against the running app.
 */
function buildCsp(nonce: string): string {
  const supabaseUrl = (() => {
    try { return new URL(env.supabase.url).origin; } catch { return ''; }
  })();
  // Supabase realtime uses a wss:// websocket on the same host.
  const supabaseWs = supabaseUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  const storage = (process.env.NEXT_PUBLIC_STORAGE_URL || '').replace(/\/+$/, '');

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    // Supabase project origin (avatars, server icons live under /storage), the
    // storage CDN, twemoji (jsdelivr), and the GIF providers. supabaseUrl must be
    // here too — it's not covered by `storage` when uploads are served straight
    // from the Supabase bucket rather than the CDN alias.
    'img-src': ["'self'", 'data:', 'blob:', supabaseUrl, storage, 'https://cdn.jsdelivr.net', 'https://media.tenor.com', 'https://*.giphy.com', 'https://media*.giphy.com'].filter(Boolean),
    'media-src': ["'self'", 'blob:', supabaseUrl, storage, 'https://*.giphy.com', 'https://media.tenor.com'].filter(Boolean),
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", supabaseUrl, supabaseWs, storage, 'https://api.giphy.com'].filter(Boolean),
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'self'"],
    'frame-ancestors': ["'self'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
    // Where the browser POSTs violation reports (our endpoint below).
    'report-uri': ['/api/csp-report'],
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

/**
 * Refresh the Supabase auth session on every matched request and keep the
 * auth cookies in sync between the browser and server.
 *
 * Must run in middleware so expired tokens are refreshed before Server
 * Components read the session. Do not add logic between client creation and
 * `getUser()` — it can cause hard-to-debug session issues.
 */
export async function updateSession(request: NextRequest) {
  // ── Per-request CSP nonce ────────────────────────────────────────────────
  // A fresh random nonce authorizes exactly this request's inline scripts.
  // Next.js auto-applies it to its own framework scripts when it sees a nonce
  // in the CSP header; our three inline <script>s read it from `x-nonce` in the
  // layout and set nonce={...} explicitly.
  // Edge-runtime safe (no Buffer): btoa on a random UUID gives an opaque nonce.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Propagate the nonce to the app (readable via headers() in the layout).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js parses the ENFORCING `Content-Security-Policy` header off the REQUEST
  // to extract the nonce and auto-apply it to its own injected scripts (the RSC
  // bootstrap/streaming script — the one reported at feed:1:xxxx). It does NOT
  // read the `-Report-Only` name. Request headers are internal to Next and never
  // reach the browser, so setting the enforcing name here does NOT block anything
  // client-side — the RESPONSE below stays Report-Only.
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  // Report-Only: browsers LOG violations (console + report endpoint) but never
  // block. This lets us validate the policy against the running app before
  // switching the header name to enforcing `Content-Security-Policy`.
  response.headers.set('Content-Security-Policy-Report-Only', csp);

  const supabase = createServerClient<Database>(env.supabase.url, env.supabase.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set('Content-Security-Policy-Report-Only', csp);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Touch the user to trigger token refresh when needed. A logged-out visitor
  // with a stale/absent refresh-token cookie makes this throw a benign
  // "refresh_token_not_found" — swallow it so it doesn't spam server logs.
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    /* no valid session — nothing to refresh */
  }

  // Fast reject for the admin console (layer 1 of 3, see [[security-model]]):
  // a request with no session never reaches the route group. The is_admin
  // check itself lives in the layout + every admin RPC — this only trims the
  // obvious unauthenticated case early.
  if (!userId && request.nextUrl.pathname.startsWith('/admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Developer portal: the DOCS (/developers/docs) are PUBLIC — anyone can read
  // them without an account. The portal pages guard themselves in their loaders.
  // Fast-reject only the non-docs portal paths for a no-session visitor.
  if (
    !userId &&
    request.nextUrl.pathname.startsWith('/developers') &&
    !request.nextUrl.pathname.startsWith('/developers/docs')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
