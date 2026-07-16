import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { validateUsernameFormat, normalizeUsername } from '@/features/auth/username-rules';
import { limitRequest } from '@/lib/rate-limit/ip';

/**
 * GET /api/username-check?username=mrbeast&exclude=mrbeast
 *
 * `exclude` is the caller's *current* username — their own name is always
 * considered available so the edit-profile form doesn't block saving.
 *
 * Returns:
 *   { available: true }
 *   { available: false, reason: 'taken' | <format-error-key> }
 */
export async function GET(request: NextRequest) {
  const limited = limitRequest(request, 'username-check', 30, 10_000);
  if (limited) return limited;

  const raw     = request.nextUrl.searchParams.get('username') ?? '';
  const exclude = request.nextUrl.searchParams.get('exclude')  ?? '';
  const username = normalizeUsername(raw);

  // 1. Format check — no DB round-trip needed
  const format = validateUsernameFormat(username);
  if (!format.ok) {
    return NextResponse.json({ available: false, reason: format.key });
  }

  // 2. If the username is unchanged (same as the caller's current one), it's available
  if (normalizeUsername(exclude) === username) {
    return NextResponse.json({ available: true });
  }

  // 3. DB availability check — a handle is taken if it's used as anyone's
  //    canonical username OR as any additional username (alias). The `exclude`
  //    above already frees the caller's own current primary username.
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: taken, error } = await (supabase as any)
    .rpc('username_taken', { handle: username });

  if (error) {
    console.error('[username-check]', error.message);
    return NextResponse.json({ available: false, reason: 'error' }, { status: 500 });
  }

  return NextResponse.json({ available: taken !== true });
}
