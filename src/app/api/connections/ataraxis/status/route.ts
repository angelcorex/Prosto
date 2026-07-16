import { type NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { ataraxisLinkStatus, ataraxisSaveConnection } from '@/features/connections/ataraxis';
import { env } from '@/lib/utils/env';

/**
 * Poll an Ataraxis link token. When the user has approved, persist the
 * connection for the CURRENTLY AUTHENTICATED user (so a token can only ever
 * link an account to its own session) and report `approved`.
 */
export async function GET(req: NextRequest) {
  if (!env.ataraxis.configured) {
    return NextResponse.json({ status: 'unknown' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ status: 'unknown' }, { status: 400 });

  const status = await ataraxisLinkStatus(token);
  if (status.status === 'approved') {
    await ataraxisSaveConnection(user.id, {
      ataraxisUserId: status.ataraxisUserId,
      username:       status.username,
      profileUrl:     status.profileUrl,
    });
  }
  return NextResponse.json({ status: status.status }, { headers: { 'Cache-Control': 'no-store' } });
}
