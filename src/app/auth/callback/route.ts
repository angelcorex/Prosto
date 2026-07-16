import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { upsertAccount } from '@/lib/accounts/store';
import { BUCKETS, uploadBuffer } from '@/lib/storage';
import { publicOrigin } from '@/lib/utils/origin';
import { site } from '@/config';

export const runtime = 'nodejs';

/** Only allow same-site relative redirects (block //evil.com and absolute URLs). */
function safeNext(value: string | null): string | null {
  const n = String(value ?? '');
  return n.startsWith('/') && !n.startsWith('//') ? n : null;
}

/**
 * Return a tiny page that hands the OAuth result back to the desktop app via
 * the `prosto://` deep link. Auto-redirects, with a manual button as a fallback
 * if the OS prompts before launching the scheme. The `code` is single-use and
 * useless without the PKCE verifier held in the app's WebView, so carrying it
 * over the scheme is safe.
 *
 * The code is carried as `c` (not `code`) so that once the shell navigates the
 * WebView to `/auth/desktop?c=…`, supabase-js's `detectSessionInUrl` doesn't
 * spot a `code` param and auto-consume the single-use code before the page can
 * exchange it explicitly. `/auth/desktop` reads it back from `c`.
 */
function desktopHandoff(code: string, next: string): Response {
  const deep = `prosto://auth?c=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prosto</title>
<style>
  html,body{height:100%;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    background:#111114;color:#e7e7ea;display:grid;place-items:center;text-align:center}
  .card{max-width:26rem;padding:2rem}
  h1{font-size:1.15rem;font-weight:700;margin:0 0 .5rem}
  p{color:#a9a9b2;font-size:.9rem;line-height:1.5;margin:0 0 1.5rem}
  a{display:inline-block;background:#fff;color:#111;text-decoration:none;font-weight:600;
    padding:.7rem 1.4rem;border-radius:.75rem;font-size:.9rem}
</style></head><body>
<div class="card">
  <h1>Возвращаемся в Prosto…</h1>
  <p>Если приложение не открылось автоматически, нажмите кнопку ниже. Эту вкладку можно закрыть.</p>
  <a id="go" href="${deep}">Открыть Prosto</a>
</div>
<script>
  var url = ${JSON.stringify(deep)};
  location.href = url;
  setTimeout(function(){ location.href = url; }, 600);
</script>
</body></html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const DEFAULT_AVATAR = '/material/avatars/default/avatar1.webp';
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function extForType(ct: string): string {
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('png')) return 'png';
  return 'png';
}

/**
 * First-login provisioning shared by both entry paths (browser code-exchange
 * and the desktop finalize hop): create a unique username + display name from
 * the provider metadata, copy the provider avatar into our own object storage,
 * and record the account on this device for the account switcher. Idempotent —
 * the profile insert is skipped for a returning user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function provisionAndTrack(supabase: any, user: any, refreshToken: string) {
  // Provision the profile only on first login (never overwrite a returning user).
  const { data: existing } = await supabase
    .from('profiles').select('id').eq('id', user.id).maybeSingle();

  if (!existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: Record<string, any> = user.user_metadata ?? {};
    const name: string =
      meta.user_name || meta.preferred_username || meta.full_name || meta.name || '';
    const providerAvatar: string = meta.avatar_url || meta.picture || '';

    let avatar = DEFAULT_AVATAR;
    if (providerAvatar) {
      try {
        const res = await fetch(providerAvatar, { cache: 'no-store' });
        const ct = res.headers.get('content-type') || 'image/png';
        if (res.ok && ct.startsWith('image/')) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.byteLength > 0 && buf.byteLength <= MAX_AVATAR_BYTES) {
            const key = `${user.id}/oauth-${Date.now()}.${extForType(ct)}`;
            const up = await uploadBuffer(BUCKETS.avatars, key, buf, ct);
            avatar = up.url;
          }
        }
      } catch {
        /* provider fetch failed → keep the default avatar */
      }
    }

    await supabase.rpc('provision_oauth_profile', { p_name: name, p_avatar: avatar });
  }

  // Track the account on this device for the account switcher.
  try {
    await upsertAccount(user.id, refreshToken);
  } catch {
    /* non-fatal */
  }
}

/**
 * OAuth callback. Exchanges the provider code for a session, and on first login
 * provisions the profile: a unique username + display name from the provider,
 * and the provider avatar copied into our own object storage (so it's served
 * from our CDN — optimized and free of third-party image domains).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next')) ?? site.routes.home;

  // Desktop finalize hop: the WebView already exchanged the code client-side
  // (that's where the PKCE verifier lives), so the session cookies are present
  // on THIS request. There is no code to exchange — just provision + track and
  // redirect into the app. Reached only via /auth/desktop after a successful
  // client-side exchange.
  if (url.searchParams.get('finalize') === '1') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    if (!user || !session) {
      return NextResponse.redirect(`${origin}${site.routes.signIn}?error=oauth`);
    }
    await provisionAndTrack(supabase, user, session.refresh_token);
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}${site.routes.signIn}?error=oauth`);
  }

  // Desktop OAuth: the provider ran in the user's system browser, so the PKCE
  // verifier cookie is NOT here — it lives in the app's WebView. Don't exchange
  // the code; instead bounce the browser back into the app via a prosto:// deep
  // link carrying the code, and let the WebView finish the exchange on
  // /auth/desktop (which then hits the finalize branch above).
  if (url.searchParams.get('desktop') === '1') {
    return desktopHandoff(code, next);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) {
    return NextResponse.redirect(`${origin}${site.routes.signIn}?error=oauth`);
  }

  await provisionAndTrack(supabase, data.user, data.session.refresh_token);

  return NextResponse.redirect(`${origin}${next}`);
}
