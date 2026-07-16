import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { ataraxisLinkInit } from '@/features/connections/ataraxis';
import { env } from '@/lib/utils/env';

/**
 * Start an Ataraxis link. Returns JSON `{ linkUrl, linkToken, expiresIn }` for
 * the settings UI to open in a popup + poll — this is NOT a redirect OAuth flow.
 * The externalUserId we register is the caller's own profile id.
 */
export async function POST() {
  if (!env.ataraxis.configured) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const init = await ataraxisLinkInit(user.id);
  if (!init) return NextResponse.json({ error: 'init_failed' }, { status: 502 });

  return NextResponse.json(init, { headers: { 'Cache-Control': 'no-store' } });
}
