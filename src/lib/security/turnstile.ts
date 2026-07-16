import 'server-only';

import { headers } from 'next/headers';

/**
 * Cloudflare Turnstile verification (bot protection for auth forms).
 *
 * The client renders a Turnstile widget which produces a one-time token; this
 * helper validates that token server-side via Cloudflare's siteverify API
 * before the auth action proceeds.
 *
 * Fail-open when unconfigured: if `TURNSTILE_SECRET_KEY` is not set (local dev,
 * or before you finish Cloudflare setup) verification is skipped so auth keeps
 * working. Once the secret is present, a missing/invalid token is rejected.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: string | null | undefined, remoteIp?: string): Promise<boolean> {
  // Local development: skip the captcha entirely so it never blocks sign-in/up.
  if (process.env.NODE_ENV === 'development') return true;

  // Any localhost origin (even a production build run locally) — skip too, so
  // the captcha never blocks local testing. Real deployments serve a public
  // host, so this can't be used to bypass in production.
  try {
    const host = (await headers()).get('host') ?? '';
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host)) return true;
  } catch {
    /* no request scope — fall through to normal verification */
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → don't block
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Network/parse failure — fail closed so an attacker can't bypass by
    // forcing the verify call to error out.
    return false;
  }
}
