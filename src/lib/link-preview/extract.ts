/**
 * Link-preview URL detection helpers (pure, dependency-free).
 *
 * Message/post bodies already give special treatment to several kinds of URL:
 *   • object-storage URLs + Tenor/Giphy      → rendered as inline media
 *   • sticker tokens                          → rendered as stickers
 *   • server-invite links (/i/… /sinvite/…)   → rendered as ServerInviteEmbed
 * Those must NOT get a generic link-preview card on top. This module extracts
 * the first "previewable" external URL from a body (skipping the above) and
 * classifies video links (YouTube / Vimeo) so the UI can show a real player.
 */

/** A detected video embed (YouTube / Vimeo) parsed from a URL. */
export interface VideoEmbed {
  provider: 'youtube' | 'vimeo';
  /** Provider video id. */
  id: string;
  /** Optional start offset in seconds (YouTube `t`/`start`). */
  start?: number;
}

// Grab http(s) URLs from free text. Kept deliberately loose; the API route does
// the strict URL parsing + SSRF validation. Trailing sentence punctuation is
// peeled off so "see https://x.com." doesn't capture the dot.
const URL_G = /https?:\/\/[^\s<>()]+/gi;

/** Storage / media hosts whose URLs are rendered as inline media, not previews. */
function isMediaUrl(url: string): boolean {
  // Object storage (own uploads) + the GIF providers are already shown as media.
  // Matching on the path/extension keeps this independent of the storage host.
  if (/\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|m4v|mp3|ogg|wav|flac)(\?|#|$)/i.test(url)) return true;
  if (/(^|\/\/)(media\d*\.tenor\.com|[a-z0-9.]*giphy\.com)\//i.test(url)) return true;
  return false;
}

/** True when the URL is a server-invite link (handled by ServerInviteEmbed). */
function isInviteUrl(url: string): boolean {
  return /\/(?:i|sinvite)\/[A-Za-z0-9]{4,}/.test(url);
}

/** Strip trailing sentence punctuation that isn't part of the URL. */
function trimUrl(raw: string): string {
  const m = raw.match(/^(.*?)([.,!?;:)\]}'"]*)$/s);
  return m?.[1] || raw;
}

/**
 * The first previewable external URL in `content`, or null. Skips media URLs,
 * sticker tokens (they contain no http URL anyway) and server-invite links.
 */
export function firstPreviewableUrl(content: string): string | null {
  const matches = content.match(URL_G);
  if (!matches) return null;
  for (const raw of matches) {
    const url = trimUrl(raw);
    if (!url) continue;
    if (isMediaUrl(url) || isInviteUrl(url)) continue;
    // Basic sanity: must parse and be http(s). (Strict SSRF checks server-side.)
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      return url;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Classify a URL as a YouTube / Vimeo video embed, or null. Recognizes the
 * common YouTube shapes (watch?v=, youtu.be/, /embed/, /shorts/, /live/) and
 * Vimeo numeric ids.
 */
export function videoEmbedOf(url: string): VideoEmbed | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();

  // ── YouTube ──
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0] ?? '';
    if (/^[\w-]{11}$/.test(id)) return { provider: 'youtube', id, start: parseStart(u) };
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return { provider: 'youtube', id: v, start: parseStart(u) };
    const seg = u.pathname.split('/').filter(Boolean);
    // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
    if (seg.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(seg[0]!)) {
      const id = seg[1]!;
      if (/^[\w-]{11}$/.test(id)) return { provider: 'youtube', id, start: parseStart(u) };
    }
  }

  // ── Vimeo ──
  if (host === 'vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0] ?? '';
    if (/^\d{6,}$/.test(id)) return { provider: 'vimeo', id };
  }

  return null;
}

/** Parse YouTube start offset from `t`/`start` (supports `90`, `1m30s`). */
function parseStart(u: URL): number | undefined {
  const raw = u.searchParams.get('t') ?? u.searchParams.get('start');
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return undefined;
  const secs = (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
  return secs > 0 ? secs : undefined;
}
