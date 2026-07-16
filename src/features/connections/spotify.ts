import 'server-only';

import type { NextRequest } from 'next/server';

import { env } from '@/lib/utils/env';
import { createAdminClient } from '@/lib/supabase/admin';
import type { NowPlaying } from './types';

/** Scopes needed to read what the user is currently listening to. */
export const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';

/**
 * The OAuth redirect URI. Must be byte-identical in the authorize request, the
 * token exchange and the Spotify dashboard. We derive it from the actual `Host`
 * header (so it matches whatever the browser used — localhost vs 127.0.0.1 vs
 * the prod domain), but an explicit `SPOTIFY_REDIRECT_URI` env always wins.
 */
export function spotifyRedirectUri(req: NextRequest): string {
  if (process.env.SPOTIFY_REDIRECT_URI) return process.env.SPOTIFY_REDIRECT_URI;
  const host = req.headers.get('host') ?? req.nextUrl.host;
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  return `${proto}://${host}/api/connections/spotify/callback`;
}

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

/** Build the Spotify authorize URL for the OAuth code flow. */
export function spotifyAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id:     env.spotify.clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         SPOTIFY_SCOPES,
    state,
    show_dialog:   'true',
  });
  return `${ACCOUNTS}/authorize?${params.toString()}`;
}

function basicAuth(): string {
  return Buffer.from(`${env.spotify.clientId}:${env.spotify.clientSecret}`).toString('base64');
}

interface TokenResponse {
  access_token:  string;
  refresh_token?: string;
  expires_in:    number;
  scope?:        string;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function spotifyExchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`spotify token exchange failed: ${res.status}`);
  return res.json();
}

/** Refresh an expired access token using the stored refresh token. */
async function spotifyRefresh(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`spotify token refresh failed: ${res.status}`);
  return res.json();
}

interface SpotifyMe {
  id:            string;
  display_name:  string | null;
  external_urls: { spotify?: string };
}

/** Fetch the connected account's Spotify profile (for display name + link). */
export async function spotifyFetchMe(accessToken: string): Promise<SpotifyMe> {
  const res = await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`spotify /me failed: ${res.status}`);
  return res.json();
}

/**
 * Return a valid access token for a profile's Spotify connection, refreshing
 * (and persisting the new token) when the stored one has expired. Uses the
 * service role so it works when a *viewer* requests another user's status.
 */
async function validAccessToken(profileId: string): Promise<string | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('profile_id', profileId)
    .eq('provider', 'spotify')
    .maybeSingle();

  if (!data?.refresh_token) return data?.access_token ?? null;

  const expired = !data.token_expires_at || new Date(data.token_expires_at).getTime() < Date.now() + 30_000;
  if (!expired && data.access_token) return data.access_token;

  const refreshed = await spotifyRefresh(data.refresh_token);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('connections')
    .update({
      access_token:     refreshed.access_token,
      token_expires_at: expiresAt,
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
    })
    .eq('profile_id', profileId)
    .eq('provider', 'spotify');

  return refreshed.access_token;
}

/** Fetch what a profile is currently listening to on Spotify. */
export async function spotifyNowPlaying(profileId: string): Promise<NowPlaying | null> {
  const token = await validAccessToken(profileId);
  if (!token) return null;

  const res = await fetch(`${API}/me/player/currently-playing`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  // 204 = nothing playing.
  if (res.status === 204 || res.status === 202) {
    return { playing: false, title: '', artists: '', albumArt: null, trackUrl: null, progressMs: 0, durationMs: 0 };
  }
  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  if (!data || data.currently_playing_type !== 'track' || !data.item) {
    return { playing: false, title: '', artists: '', albumArt: null, trackUrl: null, progressMs: 0, durationMs: 0 };
  }

  const item = data.item;
  return {
    playing:    !!data.is_playing,
    title:      item.name ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    artists:    (item.artists ?? []).map((a: any) => a.name).join(', '),
    albumArt:   item.album?.images?.[0]?.url ?? null,
    trackUrl:   item.external_urls?.spotify ?? null,
    progressMs: data.progress_ms ?? 0,
    durationMs: item.duration_ms ?? 0,
  };
}
