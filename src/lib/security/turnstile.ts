import 'server-only';

import { headers } from 'next/headers';

import { TURNSTILE_UNAVAILABLE } from './turnstile-constants';

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
 *
 * Outage tolerance: if the client couldn't run Turnstile at all it submits the
 * {@link TURNSTILE_UNAVAILABLE} marker. That marker is accepted ONLY when
 * Cloudflare is itself unreachable from the server (a genuine outage), so a real
 * Turnstile outage never locks everyone out of sign-in, yet a bot can't send the
 * marker to skip the captcha while Turnstile is healthy.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const PROBE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Cache the reachability probe briefly so a burst of degraded sign-ins doesn't
// hammer Cloudflare — the marker path is rare (only when a client's widget
// failed), so a short TTL is plenty.
let probeCache: { at: number; reachable: boolean } | null = null;
const PROBE_TTL_MS = 60_000;

/** True when Cloudflare's Turnstile endpoint answers at all (i.e. it's up). */
async function cloudflareReachable(): Promise<boolean> {
  const now = Date.now();
  if (probeCache && now - probeCache.at < PROBE_TTL_MS) return probeCache.reachable;

  let reachable = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    // Any HTTP response (even an error status) proves Cloudflare is reachable;
    // only a network failure / timeout means it's genuinely down.
    await fetch(PROBE_URL, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    reachable = true;
  } catch {
    reachable = false;
  } finally {
    clearTimeout(timeout);
  }

  probeCache = { at: now, reachable };
  return reachable;
}

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

  // Client-side degradation marker: the widget couldn't run Turnstile. Accept it
  // only if Cloudflare is actually unreachable (real outage); otherwise treat it
  // as a failed check so it can't be used to bypass a healthy captcha.
  if (token === TURNSTILE_UNAVAILABLE) return !(await cloudflareReachable());

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
