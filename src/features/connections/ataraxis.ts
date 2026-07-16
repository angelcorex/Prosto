import 'server-only';

import { env } from '@/lib/utils/env';
import { createAdminClient } from '@/lib/supabase/admin';
import type { NowPlaying } from './types';

/**
 * Ataraxis partner-API client (server-only).
 *
 * Unlike Spotify (per-user OAuth tokens), Ataraxis authenticates with ONE
 * server-side API key sent as `X-API-Key`, and identifies each user by the
 * `externalUserId` WE supply — we use the Prosto profile id. Linking is a
 * consent/poll flow: init → user approves at a link URL → poll status. Once
 * approved, the `/user/<profileId>/*` endpoints return that user's data.
 *
 * Docs: https://ataraxis.pics/faq
 */

/** Common headers for every partner call. */
function headers(json = false): Record<string, string> {
  const h: Record<string, string> = { 'X-API-Key': env.ataraxis.apiKey };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

/** Responses are shaped `{ data: {...} }`; unwrap defensively. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(body: any): any {
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

export interface LinkInit {
  linkToken: string;
  linkUrl:   string;
  expiresIn: number;
}

/** Begin linking a Prosto user (externalUserId = profile id). */
export async function ataraxisLinkInit(profileId: string): Promise<LinkInit | null> {
  if (!env.ataraxis.configured) return null;
  try {
    const res = await fetch(`${env.ataraxis.apiBase}/link/init`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ externalUserId: profileId }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const d = unwrap(await res.json());
    if (!d?.linkToken || !d?.linkUrl) return null;
    return { linkToken: d.linkToken, linkUrl: d.linkUrl, expiresIn: Number(d.expiresIn ?? 900) };
  } catch {
    return null;
  }
}

export interface LinkStatus {
  status: 'pending' | 'approved' | 'expired' | 'unknown';
  ataraxisUserId?: string | null;
  username?: string | null;
  profileUrl?: string | null;
}

/** Poll a link token's status. */
export async function ataraxisLinkStatus(token: string): Promise<LinkStatus> {
  if (!env.ataraxis.configured) return { status: 'unknown' };
  try {
    const res = await fetch(`${env.ataraxis.apiBase}/link/status?token=${encodeURIComponent(token)}`, {
      headers: headers(),
      cache: 'no-store',
    });
    if (!res.ok) return { status: 'unknown' };
    const d = unwrap(await res.json());
    const status = (d?.status as string) ?? 'unknown';
    return {
      status: status === 'approved' ? 'approved' : status === 'expired' ? 'expired' : status === 'pending' ? 'pending' : 'unknown',
      ataraxisUserId: d?.ataraxisUserId ?? d?.userId ?? null,
      username:       d?.username ?? d?.displayName ?? null,
      profileUrl:     d?.profileUrl ?? null,
    };
  } catch {
    return { status: 'unknown' };
  }
}

/** Unlink a Prosto user's Ataraxis account (best-effort on the provider side). */
export async function ataraxisUnlink(profileId: string): Promise<void> {
  if (!env.ataraxis.configured) return;
  try {
    await fetch(`${env.ataraxis.apiBase}/link/unlink`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ externalUserId: profileId }),
      cache: 'no-store',
    });
  } catch {
    /* best-effort; the local row is removed regardless */
  }
}

/** Absolute-ise a possibly-relative cover URL (`/api/player/cover?u=…`). */
function coverUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${env.ataraxis.webBase}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

const IDLE: NowPlaying = {
  playing: false, title: '', artists: '', albumArt: null, trackUrl: null,
  progressMs: 0, durationMs: 0, startedAt: null,
};

/**
 * What a Prosto profile is currently listening to on Ataraxis. Ataraxis returns
 * `playedAt` + `durationMs` but no live `progressMs`, so we pass `startedAt`
 * (epoch ms) through and let the card advance the bar from it.
 */
export async function ataraxisNowPlaying(profileId: string): Promise<NowPlaying | null> {
  if (!env.ataraxis.configured) return null;
  try {
    const res = await fetch(
      `${env.ataraxis.apiBase}/user/${encodeURIComponent(profileId)}/now-playing`,
      { headers: headers(), cache: 'no-store' },
    );
    if (!res.ok) return IDLE;
    const d = unwrap(await res.json());
    const track = d?.track;
    if (!d?.isPlaying || !track) return IDLE;

    const startedAt = d.playedAt ? new Date(d.playedAt).getTime() : null;
    const durationMs = Number(track.durationMs ?? 0);
    const progressMs = startedAt ? Math.max(0, Math.min(durationMs || Infinity, Date.now() - startedAt)) : 0;

    return {
      playing:    true,
      title:      track.title ?? '',
      artists:    track.artists ?? '',
      albumArt:   coverUrl(track.coverUrl),
      trackUrl:   track.videoId ? `${env.ataraxis.webBase}/track/${encodeURIComponent(track.videoId)}` : null,
      progressMs,
      durationMs,
      startedAt:  startedAt ?? null,
    };
  } catch {
    return IDLE;
  }
}

/**
 * Persist an approved Ataraxis link into `connections` (service role — bypasses
 * RLS, same as the Spotify callback). Stores no token: the server-side API key
 * plus the profile-id `externalUserId` is all that's needed for future reads.
 */
export async function ataraxisSaveConnection(
  profileId: string,
  info: { ataraxisUserId?: string | null; username?: string | null; profileUrl?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('connections').upsert(
    {
      profile_id:        profileId,
      provider:          'ataraxis',
      provider_user_id:  info.ataraxisUserId ?? profileId,
      provider_username: info.username || 'Ataraxis',
      provider_url:      info.profileUrl ?? null,
      show_on_profile:   true,
    },
    { onConflict: 'profile_id,provider' },
  );
}
