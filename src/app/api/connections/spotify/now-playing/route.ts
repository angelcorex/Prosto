import { type NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { spotifyNowPlaying } from '@/features/connections/spotify';
import { limitRequest } from '@/lib/rate-limit/ip';

const IDLE = { playing: false } as const;

/** Live "now playing" for a profile (respects the show-on-profile toggle). */
export async function GET(req: NextRequest) {
  const limited = limitRequest(req, 'now-playing', 60, 60_000);
  if (limited) return limited;

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
    .eq('provider', 'spotify')
    .maybeSingle();
  if (!conn || !conn.show_on_profile) return NextResponse.json(IDLE);

  try {
    const np = await spotifyNowPlaying(profile.id);
    return NextResponse.json(np ?? IDLE, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(IDLE);
  }
}
