import 'server-only';

import { NextResponse } from 'next/server';

/**
 * Stable JSON envelopes for the public bot API (`/api/v1`).
 *
 * Success: `{ ok: true, ...data }`
 * Error:   `{ ok: false, error: <code>, message? }` with a matching HTTP status.
 * All responses are `no-store` — bot API data is never cacheable.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function apiOk(data: Record<string, unknown> = {}, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status, headers: NO_STORE });
}

export function apiError(status: number, code: string, message?: string): NextResponse {
  const headers: Record<string, string> = { ...NO_STORE };
  if (status === 429) headers['Retry-After'] = '10';
  return NextResponse.json(
    { ok: false, error: code, ...(message ? { message } : {}) },
    { status, headers },
  );
}

/**
 * Map a Postgres RPC error message to a client-facing API error. The RPCs raise
 * short machine-readable strings (e.g. 'forbidden', 'bot_inactive') — surface
 * those as stable codes rather than leaking raw SQL errors.
 */
export function rpcError(message: string | undefined): NextResponse {
  const msg = (message || '').toLowerCase();
  if (msg.includes('rate_limited')) return apiError(429, 'rate_limited');
  if (msg.includes('forbidden')) return apiError(403, 'forbidden');
  if (msg.includes('bot_inactive')) return apiError(403, 'bot_inactive');
  if (msg.includes('not a participant')) return apiError(403, 'not_a_participant');
  if (msg.includes('already_responded')) return apiError(409, 'already_responded');
  if (msg.includes('interaction_expired')) return apiError(410, 'interaction_expired');
  if (msg.includes('unknown_interaction')) return apiError(404, 'unknown_interaction');
  if (msg.includes('invalid content')) return apiError(400, 'invalid_content');
  return apiError(400, 'bad_request', message);
}
