import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { spotifyAuthorizeUrl, spotifyRedirectUri } from '@/features/connections/spotify';
import { PROVIDERS } from '@/features/connections/providers';
import { site } from '@/config';

/** Kick off the Spotify OAuth code flow. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(site.routes.signIn, req.nextUrl.origin));

  // Connecting is paused (Spotify dev-mode allowlist). Refuse direct hits to the
  // route and send the user back to settings instead of starting OAuth.
  if (!PROVIDERS.spotify.available) {
    return NextResponse.redirect(new URL('/settings/connections?error=unavailable', req.nextUrl.origin));
  }

  const state = randomUUID();
  const redirectUri = spotifyRedirectUri(req);
  const res = NextResponse.redirect(spotifyAuthorizeUrl(redirectUri, state));
  res.cookies.set('spotify_oauth_state', state, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
