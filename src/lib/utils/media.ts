/**
 * Public base URL of our object storage (bucket path included). Available on
 * both client and server (NEXT_PUBLIC). Trailing slashes are trimmed.
 */
const STORAGE_BASE = (process.env.NEXT_PUBLIC_STORAGE_URL ?? '').replace(/\/+$/, '');

/**
 * Origins that stored URLs may still point at from before the HTTPS CDN
 * (media saved with the raw MinIO endpoint). They're rewritten to STORAGE_BASE
 * at render time so existing media loads over HTTPS (no mixed-content blocking)
 * and is still recognized as our storage. Object paths are identical
 * (`/<bucket>/<key>`), so only the origin swaps.
 */
const LEGACY_STORAGE_ORIGINS = ['http://89.22.234.188:10010'];

/** Rewrite a legacy storage origin to the current HTTPS base; pass through otherwise. */
export function normalizeMediaUrl(url: string): string {
  if (!STORAGE_BASE) return url;
  for (const origin of LEGACY_STORAGE_ORIGINS) {
    if (url.startsWith(`${origin}/`)) return STORAGE_BASE + url.slice(origin.length);
  }
  return url;
}

/** True when the URL points at our own object storage. */
export function isStorageUrl(url: string): boolean {
  return STORAGE_BASE.length > 0 && url.startsWith(`${STORAGE_BASE}/`);
}

const IMAGE_EXT_RE = /\.(gif|png|jpe?g|webp|avif)(\?.*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

/**
 * Detect text whose entire content is a single image/GIF URL — our own
 * uploaded image, a direct image link, or a Tenor/Giphy GIF. Used to render
 * images/GIFs inline in chat and posts.
 *
 * Storage URLs must carry an image extension: the same bucket now also holds
 * videos and other files, so a bare storage URL is no longer assumed to be an
 * image.
 */
export function imageUrlOf(content: string): string | null {
  const text = normalizeMediaUrl(content.trim());
  if (/\s/.test(text)) return null;
  const storage = isStorageUrl(text);
  if (!storage && !/^https:\/\//i.test(text)) return null;
  if (IMAGE_EXT_RE.test(text)) return text;
  if (storage) return null; // our storage but not an image extension → video/file
  if (/(^|\.)tenor\.com\//i.test(text) || /media\.tenor\.com\//i.test(text)) return text;
  if (/(^|\.)giphy\.com\//i.test(text) || /media\d*\.giphy\.com\//i.test(text)) return text;
  return null;
}

/** Max attachments in one chat message. */
export const MAX_CHAT_IMAGES = 10;
/**
 * Max upload size (MB) for the default (free) user, and the higher cap for
 * Super Prosto subscribers (profiles.is_premium). Use {@link uploadLimitBytes} /
 * {@link uploadLimitMb} to pick the right cap for a user; the server actions
 * re-check server-side so the client cap can't be bypassed.
 */
export const MAX_UPLOAD_MB = 15;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_UPLOAD_MB_PREMIUM = 100;
export const MAX_UPLOAD_BYTES_PREMIUM = MAX_UPLOAD_MB_PREMIUM * 1024 * 1024;

/** Upload byte cap for a user, by plan (Super Prosto → higher). */
export function uploadLimitBytes(isPremium?: boolean | null): number {
  return isPremium ? MAX_UPLOAD_BYTES_PREMIUM : MAX_UPLOAD_BYTES;
}
/** Upload MB cap for a user, by plan — for UI copy ("file too large" warnings). */
export function uploadLimitMb(isPremium?: boolean | null): number {
  return isPremium ? MAX_UPLOAD_MB_PREMIUM : MAX_UPLOAD_MB;
}

export interface ChatAttachment {
  url: string;
  kind: 'image' | 'video' | 'file';
  /** Original filename — only known for not-yet-uploaded (local) previews. */
  name?: string;
  /** Byte size — known for local previews; drives the upload card's size label. */
  size?: number;
  /** Upload progress 0–100 while sending; undefined once uploaded. */
  progress?: number;
  /** Hide behind a blur until clicked (NSFW / spoiler). Persisted for posts. */
  spoiler?: boolean;
  /** Age-restricted (18+) — gated by viewer age. Persisted for posts. */
  nsfw?: boolean;
}

/**
 * Poster URL for a GIF avatar/banner: the static first-frame WebP we generate
 * on upload lives at the same key with `.gif` → `.poster.webp`, preserving any
 * `?t=` cache-buster. Returns null for non-GIF or non-storage URLs. The caller
 * should fall back gracefully if the poster doesn't exist (legacy GIFs).
 *
 *   avatar/uid.gif?t=123 → avatar/uid.poster.webp?t=123
 */
export function gifPosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const [path, query] = url.split('?');
  if (!path || !/\.gif$/i.test(path)) return null;
  const poster = path.replace(/\.gif$/i, '.poster.webp');
  return query ? `${poster}?${query}` : poster;
}

/** Human-readable byte size, e.g. `14.1 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Classify a single URL as an attachment kind, or null if it isn't one. */
export function mediaKind(url: string): ChatAttachment['kind'] | null {
  const u = normalizeMediaUrl(url);
  if (VIDEO_EXT_RE.test(u)) return 'video';
  if (imageUrlOf(u)) return 'image';
  if (isStorageUrl(u)) return 'file'; // our storage, unknown ext → generic file
  return null;
}

/**
 * Resolve the media a post should render, newest scheme first:
 *  1. the structured `attachments` JSONB column (array of { url, kind, name? }),
 *  2. the legacy single `image_url` column,
 *  3. a bare media URL that is the post's entire content (oldest posts).
 * Always returns a typed, validated list (unknown/foreign URLs are dropped).
 */
export function parsePostAttachments(
  attachments: unknown,
  imageUrl?: string | null,
  content?: string | null,
): ChatAttachment[] {
  if (Array.isArray(attachments) && attachments.length > 0) {
    const out: ChatAttachment[] = [];
    for (const a of attachments.slice(0, MAX_CHAT_IMAGES)) {
      if (!a || typeof a !== 'object') continue;
      const rec = a as Record<string, unknown>;
      const url = typeof rec.url === 'string' ? normalizeMediaUrl(rec.url) : null;
      if (!url) continue;
      const kind =
        rec.kind === 'image' || rec.kind === 'video' || rec.kind === 'file'
          ? rec.kind
          : (mediaKind(url) ?? 'file');
      const name = typeof rec.name === 'string' && rec.name ? rec.name : undefined;
      const spoiler = rec.spoiler === true;
      const nsfw = rec.nsfw === true;
      out.push({ url, kind, ...(name ? { name } : {}), ...(spoiler ? { spoiler } : {}), ...(nsfw ? { nsfw } : {}) });
    }
    if (out.length > 0) return out;
  }
  if (imageUrl) {
    const url = normalizeMediaUrl(imageUrl);
    return [{ url, kind: mediaKind(url) ?? 'image' }];
  }
  if (content) {
    const legacy = imageUrlOf(content);
    if (legacy) return [{ url: legacy, kind: 'image' }];
  }
  return [];
}

/**
 * Per-attachment flags chat stores inside the message content — where an
 * attachment is just its URL, with no structured column to hold metadata. The
 * flags ride as query params on the stored URL: they round-trip through the
 * message text and are ignored by the CDN/storage on GET (so the object still
 * resolves), while {@link splitAttachmentMeta} peels them back off at render.
 */
const ATTACHMENT_META_KEYS = ['spoiler', 'filename'] as const;

/** Append spoiler / custom-name flags to a stored chat URL as query params. */
export function withAttachmentMeta(url: string, meta: { spoiler?: boolean; name?: string }): string {
  const params: string[] = [];
  if (meta.spoiler) params.push('spoiler=1');
  if (meta.name) params.push(`filename=${encodeURIComponent(meta.name.slice(0, 200))}`);
  if (params.length === 0) return url;
  return url + (url.includes('?') ? '&' : '?') + params.join('&');
}

/**
 * Split our attachment-meta query params off a stored URL, returning a clean
 * URL (our params removed, any other params preserved) plus the decoded flags.
 */
function splitAttachmentMeta(rawUrl: string): { url: string; spoiler: boolean; name?: string } {
  const q = rawUrl.indexOf('?');
  if (q < 0) return { url: rawUrl, spoiler: false };
  const base = rawUrl.slice(0, q);
  const params = new URLSearchParams(rawUrl.slice(q + 1));
  const spoiler = params.get('spoiler') === '1';
  const nameRaw = params.get('filename');
  const name = nameRaw ? nameRaw.slice(0, 200) : undefined;
  for (const k of ATTACHMENT_META_KEYS) params.delete(k);
  const rest = params.toString();
  return { url: rest ? `${base}?${rest}` : base, spoiler, name };
}

/**
 * If a message's whole content is 1..MAX_CHAT_IMAGES media/file URLs
 * (whitespace/newline separated), return them typed; otherwise null so normal
 * text and plain links are unaffected. A token counts only if it's a known
 * image/GIF URL, a video URL, or one of our storage URLs. Per-attachment
 * spoiler / custom-name flags (see {@link withAttachmentMeta}) are decoded and
 * stripped from the returned URL.
 */
export function attachmentsOf(content: string): ChatAttachment[] | null {
  const parts = content.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > MAX_CHAT_IMAGES) return null;
  const out: ChatAttachment[] = [];
  for (const p of parts) {
    const meta = splitAttachmentMeta(normalizeMediaUrl(p));
    const kind = mediaKind(meta.url);
    if (!kind) return null;
    out.push({ url: meta.url, kind, ...(meta.spoiler ? { spoiler: true } : {}), ...(meta.name ? { name: meta.name } : {}) });
  }
  return out;
}
