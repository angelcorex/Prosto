import 'server-only';

import { NextResponse } from 'next/server';

/**
 * In-memory, per-IP rate limiter for public (unauthenticated) API routes.
 *
 * This is an application-layer guard against scraping, brute force and cheap
 * app-level DoS (e.g. hammering a route that hits an external API or the DB).
 * It is intentionally simple: a fixed-window counter kept in a process-local
 * Map.
 *
 * Scope & limits of this approach:
 *  - State lives per server instance. On a single VPS (one Node process) that
 *    covers all traffic. Behind multiple instances/serverless it is only a
 *    soft, best-effort guard.
 *  - It does NOT stop volumetric/network DDoS — that must be absorbed at the
 *    edge (Cloudflare/WAF) in front of the app. See the security notes.
 *
 * For per-user limits on authenticated actions, use the DB-backed
 * `checkRateLimit` (src/lib/rate-limit/check.ts) instead.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
let lastSweep = 0;

/** Drop expired windows occasionally so the Map can't grow unbounded. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, win] of windows) {
    if (win.resetAt <= now) windows.delete(key);
  }
}

/**
 * Best-effort client IP from proxy headers. Behind Caddy/Nginx/Cloudflare the
 * real client is in `x-forwarded-for` (first hop) or `x-real-ip`. Falls back to
 * a constant so a missing header can't bypass the limit by looking "unique".
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Fixed-window rate limit for an arbitrary key. Returns whether the call is
 * allowed and how long (ms) until the window resets.
 */
export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryMs: number } {
  const now = Date.now();
  sweep(now);

  const win = windows.get(key);
  if (!win || win.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryMs: 0 };
  }
  if (win.count >= max) {
    return { ok: false, retryMs: win.resetAt - now };
  }
  win.count += 1;
  return { ok: true, retryMs: 0 };
}

/**
 * Guard a request by client IP for a named route. Returns a ready-to-return
 * 429 `NextResponse` when over the limit, or `null` when the call may proceed.
 *
 * Usage in a route handler:
 *   const limited = limitRequest(request, 'search', 30, 10_000);
 *   if (limited) return limited;
 */
export function limitRequest(
  request: Request,
  route: string,
  max: number,
  windowMs: number,
): NextResponse | null {
  const ip = clientIp(request.headers);
  const { ok, retryMs } = rateLimit(`${route}:${ip}`, max, windowMs);
  if (ok) return null;
  const retrySecs = Math.max(1, Math.ceil(retryMs / 1000));
  return NextResponse.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(retrySecs) } },
  );
}
