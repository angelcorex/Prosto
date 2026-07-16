/**
 * Connection provider registry.
 *
 * Two kinds of connections:
 *  - `oauth`  — the user logs in at the provider so we can verify ownership and
 *               (optionally) fetch a live status. Requires a registered OAuth
 *               app; some providers gate this behind company/business review.
 *               Spotify is the only one and is currently paused.
 *  - `manual` — the user simply enters their handle and we render a link chip.
 *               No API approval needed, so this is what an indie project can
 *               ship for essentially any platform (X, Bluesky, Steam, Roblox,
 *               Telegram, Twitch, GitHub, YouTube, Reddit, TikTok, Instagram…).
 *
 * The UI iterates over this registry, so new entries show up automatically.
 * A `manual` provider can be upgraded to `oauth` later without touching the UI.
 */

export type ProviderId =
  | 'spotify'
  | 'ataraxis'
  | 'twitter'
  | 'bluesky'
  | 'steam'
  | 'telegram'
  | 'twitch'
  | 'github'
  | 'youtube'
  | 'reddit'
  | 'tiktok'
  | 'instagram'
  | 'website';

export type ConnectionKind = 'oauth' | 'manual';

export interface ProviderMeta {
  id:    ProviderId;
  label: string;
  /** Remix Icon class for the provider logo (rendered monochrome). */
  icon:  string;
  /** How ownership is established. */
  kind:  ConnectionKind;
  /** Whether a live "now playing / status" card is supported (oauth only). */
  hasStatus: boolean;
  /**
   * Whether new connections can currently be initiated. When false the UI shows
   * a "coming soon" state instead of a Connect button — existing connections
   * keep working. Spotify is paused while limited to its dev-mode allowlist.
   */
  available: boolean;
  /**
   * For `manual` providers: template that turns a handle into a public profile
   * URL (`{handle}` is replaced). `website` is special-cased (the handle IS the
   * URL) and needs no template.
   */
  urlTemplate?: string;
  /** Placeholder shown in the handle input (`manual` providers). */
  placeholder?: string;
  /**
   * `oauth` providers only. When true, linking is a POLL flow (not a redirect):
   * the client opens the provider's approval page in a popup and polls a status
   * endpoint until the user approves. Ataraxis works this way (a single
   * server-side API key + `link/init`→`link/status`), unlike Spotify's redirect
   * OAuth. The UI branches on this to know how to start a connection.
   */
  pollLink?: boolean;
  /** Brand colour (hex) for the "listening" card accent, oauth+status only. */
  brandColor?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  spotify: {
    id: 'spotify', label: 'Spotify', icon: 'ri-spotify-fill',
    kind: 'oauth', hasStatus: true, available: false, brandColor: '#1DB954',
  },
  ataraxis: {
    id: 'ataraxis', label: 'Ataraxis', icon: 'ri-music-2-fill',
    kind: 'oauth', hasStatus: true, available: true, pollLink: true, brandColor: '#a78bfa',
  },
  twitter: {
    id: 'twitter', label: 'X', icon: 'ri-twitter-x-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://x.com/{handle}', placeholder: 'username',
  },
  bluesky: {
    id: 'bluesky', label: 'Bluesky', icon: 'ri-bluesky-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://bsky.app/profile/{handle}', placeholder: 'name.bsky.social',
  },
  steam: {
    id: 'steam', label: 'Steam', icon: 'ri-steam-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://steamcommunity.com/id/{handle}', placeholder: 'custom URL',
  },
  telegram: {
    id: 'telegram', label: 'Telegram', icon: 'ri-telegram-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://t.me/{handle}', placeholder: 'username',
  },
  twitch: {
    id: 'twitch', label: 'Twitch', icon: 'ri-twitch-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://twitch.tv/{handle}', placeholder: 'username',
  },
  github: {
    id: 'github', label: 'GitHub', icon: 'ri-github-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://github.com/{handle}', placeholder: 'username',
  },
  youtube: {
    id: 'youtube', label: 'YouTube', icon: 'ri-youtube-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://youtube.com/@{handle}', placeholder: 'handle',
  },
  reddit: {
    id: 'reddit', label: 'Reddit', icon: 'ri-reddit-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://reddit.com/user/{handle}', placeholder: 'username',
  },
  tiktok: {
    id: 'tiktok', label: 'TikTok', icon: 'ri-tiktok-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://tiktok.com/@{handle}', placeholder: 'username',
  },
  instagram: {
    id: 'instagram', label: 'Instagram', icon: 'ri-instagram-fill',
    kind: 'manual', hasStatus: false, available: true,
    urlTemplate: 'https://instagram.com/{handle}', placeholder: 'username',
  },
  website: {
    id: 'website', label: 'Website', icon: 'ri-global-line',
    kind: 'manual', hasStatus: false, available: true,
    placeholder: 'https://example.com',
  },
};

export const PROVIDER_LIST: ProviderMeta[] = Object.values(PROVIDERS);

/** Strip a leading @ and any characters that can't appear in a handle. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/[^A-Za-z0-9_.-]/g, '');
}

/** True for `http(s)` URLs only — blocks `javascript:` and other schemes. */
function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Build the public profile URL for a manual connection from a raw handle.
 * Returns `null` when the input is empty or can't produce a safe http(s) URL.
 */
export function buildProviderUrl(meta: ProviderMeta, rawHandle: string): string | null {
  if (meta.id === 'website') {
    const raw = rawHandle.trim();
    if (!raw) return null;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return isSafeHttpUrl(url) ? url : null;
  }
  const handle = normalizeHandle(rawHandle);
  if (!handle || !meta.urlTemplate) return null;
  const url = meta.urlTemplate.replace('{handle}', handle);
  return isSafeHttpUrl(url) ? url : null;
}

/** The value stored/shown as the connection's username (handle for links). */
export function displayHandle(meta: ProviderMeta, rawHandle: string): string {
  return meta.id === 'website' ? rawHandle.trim() : normalizeHandle(rawHandle);
}
