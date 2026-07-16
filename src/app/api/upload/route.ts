import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { uploadBuffer, objectKey, BUCKETS } from '@/lib/storage';
import { uploadLimitBytes } from '@/lib/utils/media';
import { checkRateLimit } from '@/lib/rate-limit/check';

/**
 * Chat / post attachment upload.
 *
 * The client POSTs the raw file bytes (not multipart) with metadata in the
 * query string + `Content-Type` header, and the handler buffers the body and
 * PutObjects it to storage. This avoids both the Server Action body cap and
 * the route-handler multipart parser (which fails on large files), so uploads
 * scale to the plan's max size. Same-origin, so the browser uploads with a
 * plain XHR (no CORS) and gets real `upload.onprogress` events.
 *
 * Auth + per-plan size limit are re-checked here; the client cap isn't trusted.
 */

export const runtime = 'nodejs';
// Large uploads on slow connections need headroom (Super Prosto → up to 100 MB).
export const maxDuration = 300;

const BUCKET_KEYS = ['chat', 'posts', 'servers', 'avatars'] as const;
type BucketKey = (typeof BUCKET_KEYS)[number];

/**
 * Server-side allow-list of storable content types. Anything not on this list
 * is rejected. Critically this EXCLUDES `image/svg+xml` and `text/html`: served
 * inline from a public storage origin they would execute script (stored XSS).
 * The client-declared type is NOT trusted for anything security-relevant.
 */
const ALLOWED_UPLOAD_TYPES = new Set<string>([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
  'audio/mpeg', 'audio/wav', 'audio/mp4',
  'application/pdf',
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Per-user upload ceiling (DB-backed, survives restarts / multiple instances):
  // 30 uploads / minute is generous for real use but stops a script hammering
  // storage. Runs before the body is buffered so a flood is cheap to reject.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(await checkRateLimit(supabase as any, 'upload', 30, 60))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get('name') || 'file';
  const rawBucket = searchParams.get('bucket');
  const bucketKey: BucketKey = BUCKET_KEYS.includes(rawBucket as BucketKey) ? (rawBucket as BucketKey) : 'chat';

  const contentType = (request.headers.get('content-type') || 'application/octet-stream').split(';')[0]!.trim().toLowerCase();
  const size = Number(request.headers.get('content-length') || 0);

  if (!size || !request.body) return NextResponse.json({ error: 'no_file' }, { status: 400 });

  // Reject anything outside the media allow-list — in particular SVG and HTML,
  // which would be stored-XSS when served inline from the public storage origin.
  if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prof } = await (supabase as any)
    .from('profiles').select('is_premium').eq('id', user.id).maybeSingle();
  if (size > uploadLimitBytes(prof?.is_premium)) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  try {
    // Buffer the raw body: a body of known length lets the AWS SDK compute a
    // real SigV4 payload signature, which MinIO accepts reliably (streamed
    // bodies trip chunked-signature handling and 500 on PutObject).
    const body = Buffer.from(await request.arrayBuffer());
    if (body.byteLength > uploadLimitBytes(prof?.is_premium)) {
      return NextResponse.json({ error: 'too_large' }, { status: 413 });
    }
    // extOf() only reads .name / .type, so a lightweight shape is enough.
    const key = objectKey(user.id, { name: fileName, type: contentType } as File);
    const { url } = await uploadBuffer(BUCKETS[bucketKey], key, body, contentType);
    return NextResponse.json({ url });
  } catch (e) {
    console.error('[api/upload]', e instanceof Error ? e.message : e, `size=${size} type=${contentType}`);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
