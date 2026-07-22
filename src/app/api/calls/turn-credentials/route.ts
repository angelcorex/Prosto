import { createHmac } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { limitRequest } from '@/lib/rate-limit/ip';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/utils/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CREDENTIAL_TTL_SECONDS = 60 * 60;
const TURN_PORT = 3478;

/**
 * Return short-lived coturn REST credentials to an authenticated user.
 * The shared secret never leaves the server; coturn independently validates
 * the HMAC credential and rejects it after the timestamp in the username.
 */
export async function GET(request: NextRequest) {
  const limited = limitRequest(request, 'turn-credentials', 30, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const expiresAt = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:${user.id}`;
  const credential = createHmac('sha1', env.turn.sharedSecret)
    .update(username)
    .digest('base64');
  const host = env.turn.host;

  return NextResponse.json(
    {
      urls: [
        `turn:${host}:${TURN_PORT}?transport=udp`,
        `turn:${host}:${TURN_PORT}?transport=tcp`,
      ],
      username,
      credential,
      expiresAt,
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}
