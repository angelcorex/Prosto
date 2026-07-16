import { type NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SPOTIFY_SCOPES, spotifyExchangeCode, spotifyFetchMe, spotifyRedirectUri } from '@/features/connections/spotify';
import { site } from '@/config';

const SETTINGS = '/settings/connections';

/** Spotify OAuth redirect target: exchange the code and store the connection. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(site.routes.signIn, origin));

  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const cookieState = req.cookies.get('spotify_oauth_state')?.value;

  const fail = () => NextResponse.redirect(new URL(`${SETTINGS}?error=spotify`, origin));
  if (!code || !state || !cookieState || state !== cookieState) return fail();

  try {
    const redirectUri = spotifyRedirectUri(req);
    const token = await spotifyExchangeCode(code, redirectUri);
    const me = await spotifyFetchMe(token.access_token);

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('connections').upsert(
      {
        profile_id:        user.id,
        provider:          'spotify',
        provider_user_id:  me.id,
        provider_username: me.display_name || me.id,
        provider_url:      me.external_urls?.spotify ?? null,
        access_token:      token.access_token,
        token_expires_at:  new Date(Date.now() + token.expires_in * 1000).toISOString(),
        scopes:            token.scope ?? SPOTIFY_SCOPES,
        show_on_profile:   true,
        // Only overwrite the refresh token when Spotify returned a new one.
        ...(token.refresh_token ? { refresh_token: token.refresh_token } : {}),
      },
      { onConflict: 'profile_id,provider' },
    );
  } catch (e) {
    console.error('[spotify callback] failed:', e);
    return fail();
  }

  const res = NextResponse.redirect(new URL(`${SETTINGS}?connected=spotify`, origin));
  res.cookies.delete('spotify_oauth_state');
  return res;
}
