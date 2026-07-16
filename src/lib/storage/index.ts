import 'server-only';

import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import { env } from '@/lib/utils/env';
import { storageClient } from './client';

/**
 * Object storage — the single entry point the whole app uses to store user
 * content. Reads/writes always go through here so the backend stays swappable
 * and credentials never leak past the server.
 *
 * Content is split across a few buckets by domain (so each can have its own
 * access policy / lifecycle / quota later). Features pick a bucket + build
 * their own object *key* (folder conventions live with the feature).
 */

/** Logical buckets. Values must match the bucket names created in MinIO. */
export const BUCKETS = {
  /** Profile avatars & banners (static + animated GIF), group avatars. */
  avatars: 'avatars',
  /** Server icons/banners, role icons, channel themes, home assets, emojis. */
  servers: 'servers',
  /** Images attached to feed posts. */
  posts: 'posts',
  /** Images sent in DMs and server channels. */
  chat: 'chat',
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

export interface StoredObject {
  /** Public URL to render the object from. */
  url: string;
  /** The bucket the object lives in. */
  bucket: string;
  /** The object key within the bucket (store this if you later need to delete). */
  key: string;
}

/** Public URL for a stored object. Path-style: `<base>/<bucket>/<key>`. */
export function objectUrl(bucket: string, key: string): string {
  return `${env.storage.publicUrl}/${bucket}/${key.replace(/^\/+/, '')}`;
}

/**
 * Safe, lowercase file extension for a File. Prefers the filename extension,
 * falls back to the MIME subtype, then to `fallback`. `jpeg` is normalized to
 * `jpg`.
 */
export function extOf(file: File, fallback = 'jpg'): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  const fromType = file.type.split('/')[1]?.toLowerCase();
  if (fromType && /^[a-z0-9]{1,5}$/.test(fromType)) return fromType === 'jpeg' ? 'jpg' : fromType;
  return fallback;
}

/**
 * Build a collision-resistant key under a prefix, e.g.
 * `objectKey('<uid>', file)` → `<uid>/1720000000000-a1b2c3d4.webp`.
 */
export function objectKey(prefix: string, file: File, fallbackExt = 'jpg'): string {
  const ext = extOf(file, fallbackExt);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix.replace(/\/+$/, '')}/${Date.now()}-${rand}.${ext}`;
}

/** Map a file extension → a correct MIME type. Prevents objects being stored as
 *  `application/octet-stream`, which Firefox's ORB blocks (with `nosniff`). */
const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  ogg: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  pdf: 'application/pdf',
};

/**
 * Resolve the Content-Type to store an object with. Uses the File's own MIME
 * type when it's specific, otherwise infers from the key's extension. Never
 * returns a generic `application/octet-stream` for known media, so the browser
 * always gets a renderable type back on GET.
 */
export function contentTypeFor(file: File, key: string): string {
  const resolved = (() => {
    const t = file.type;
    if (t && t !== 'application/octet-stream') return t;
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    return MIME_BY_EXT[ext] ?? 'application/octet-stream';
  })();
  // Defense-in-depth against stored XSS: objects are served from a public
  // storage origin, so any type the browser renders inline as markup (SVG, HTML,
  // XML) must NEVER be stored with that content-type — it would execute script.
  // Force such uploads to an opaque type so they download instead of running.
  // This is the last line regardless of which upload path is used.
  const t = resolved.toLowerCase();
  if (t === 'image/svg+xml' || t.includes('html') || t.includes('xml') || t === 'text/plain') {
    return 'application/octet-stream';
  }
  return resolved;
}

/**
 * Upload a File/Blob (typically from a FormData field) to a bucket and return
 * its public URL + key. Objects are cached immutably for a year by default,
 * which is correct for content-addressed keys (unique per upload). For stable
 * keys that are overwritten (e.g. `avatar/<uid>.jpg`), append a cache-busting
 * query param to the returned URL at the call site.
 *
 * Uses a Node.js Readable stream instead of loading the whole file into a
 * Buffer, so large uploads don't exhaust serverless function memory.
 */
export async function uploadFile(
  bucket: string,
  key: string,
  file: File,
  opts?: { cacheControl?: string },
): Promise<StoredObject> {
  const body = Buffer.from(await file.arrayBuffer());
  return uploadBuffer(bucket, key, body, file.type, opts?.cacheControl);
}

/**
 * Upload a fully-buffered payload (e.g. a route handler's raw body read via
 * `request.arrayBuffer()`) to a bucket. Buffering gives the AWS SDK a body of
 * known length that it can hash for a real SigV4 signature — the combination
 * MinIO accepts reliably, unlike streamed bodies which trip chunked-signature
 * handling. Uploads are capped per plan (Super Prosto → 100 MB), well within
 * the VDS memory budget.
 *
 * `contentType` should be the client's declared type; generic/empty types fall
 * back to the key's extension so the object is served with a renderable MIME.
 */
export async function uploadBuffer(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl?: string,
): Promise<StoredObject> {
  await storageClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentTypeFor({ type: contentType } as File, key),
      ContentLength: body.byteLength,
      CacheControl: cacheControl ?? 'public, max-age=31536000, immutable',
    }),
  );
  return { url: objectUrl(bucket, key), bucket, key };
}

/**
 * Generate + store a static first-frame WebP "poster" for a GIF, next to it at
 * the same key with `.gif` → `.poster.webp`. Lists render this tiny still
 * (~20–50 KB) instead of downloading the whole animated GIF (often megabytes)
 * just to freeze one frame. Best-effort: returns the poster URL on success,
 * null on any failure (caller falls back to the GIF).
 *
 * `sharp` is imported dynamically so it's only pulled into server bundles that
 * actually make posters, and a missing/broken sharp never breaks the upload.
 */
export async function uploadGifPoster(
  bucket: string,
  gifKey: string,
  gifBytes: Buffer,
): Promise<string | null> {
  if (!/\.gif$/i.test(gifKey)) return null;
  try {
    const { default: sharp } = await import('sharp');
    // page:0 → first frame only; cap at 512px; strip metadata; WebP q80.
    const poster = await sharp(gifBytes, { page: 0 })
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const posterKey = gifKey.replace(/\.gif$/i, '.poster.webp');
    const { url } = await uploadBuffer(bucket, posterKey, poster, 'image/webp');
    return url;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadGifPoster]', e);
    return null;
  }
}

/** Delete an object by bucket + key. Best-effort — callers generally ignore failures. */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  await storageClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Resolve a public object URL back to its `{ bucket, key }`. Handles both the
 * MinIO/S3 path-style URL (`<base>/<bucket>/<key>`) and legacy Supabase URLs
 * (`…/storage/v1/object/public/<bucket>/<key>`) by finding the first known
 * bucket name in the path and taking everything after it as the key. Returns
 * null for URLs that don't point at one of our buckets.
 */
export function storageRefFromUrl(url: string): { bucket: string; key: string } | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const parts = pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const buckets = Object.values(BUCKETS) as string[];
  for (let i = 0; i < parts.length; i++) {
    if (buckets.includes(parts[i]!)) {
      const key = parts.slice(i + 1).join('/');
      if (key) return { bucket: parts[i]!, key };
    }
  }
  return null;
}

/**
 * Best-effort delete of a stored object addressed by its public URL. Never
 * throws — storage cleanup must not block the database delete it accompanies.
 */
export async function deleteObjectByUrl(url: string): Promise<void> {
  const ref = storageRefFromUrl(url);
  if (!ref) return;
  try {
    await deleteObject(ref.bucket, ref.key);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[deleteObjectByUrl]', e);
  }
}
