import { type NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { ataraxisNowPlaying } from '@/features/connections/ataraxis';
import { limitRequest } from '@/lib/rate-limit/ip';
import { env } from '@/lib/utils/env';

const IDLE = { playing: false } as const;

/** Live Ataraxis "now playing" for a profile (respects the show-on-profile toggle). */
export async function GET(req: NextRequest) {
  const limited = limitRequest(req, 'now-playing-ataraxis', 60, 60_000);
  if (limited) return limited;

  if (!env.ataraxis.configured) return NextResponse.json(IDLE);

  const username = req.nextUrl.searchParams.get('u');
  if (!username) return NextResponse.json(IDLE);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles').select('id').eq('username', username).maybeSingle();
  if (!profile) return NextResponse.json(IDLE);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conn } = await (admin as any)
    .from('connections')
    .select('show_on_profile')
    .eq('profile_id', profile.id)
    .eq('provider', 'ataraxis')
    .maybeSingle();
  if (!conn || !conn.show_on_profile) return NextResponse.json(IDLE);

  try {
    const np = await ataraxisNowPlaying(profile.id);
    return NextResponse.json(np ?? IDLE, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(IDLE);
  }
}
