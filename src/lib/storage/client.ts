import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';

import { env } from '@/lib/utils/env';

/**
 * Shared S3 client for the object store (MinIO in production, but any
 * S3-compatible backend works — AWS S3, Cloudflare R2, Backblaze B2 — by only
 * changing env vars).
 *
 * `forcePathStyle` is required for MinIO and most self-hosted stores, which
 * serve buckets as `endpoint/<bucket>/<key>` rather than the virtual-hosted
 * `<bucket>.endpoint/<key>` form AWS uses.
 *
 * Cached across invocations within a server runtime to avoid rebuilding the
 * client (and its connection pool) on every request.
 */
let cached: S3Client | null = null;

export function storageClient(): S3Client {
  if (cached) return cached;
  cached = new S3Client({
    endpoint: env.storage.endpoint,
    region: env.storage.region,
    forcePathStyle: true,
    // AWS SDK v3 (>= 3.729) enables CRC32 request checksums by default. For a
    // presigned PUT that means the URL carries `x-amz-sdk-checksum-algorithm`
    // and the server expects a matching `x-amz-checksum-crc32` request header —
    // which a plain browser XHR PUT never sends. MinIO then rejects the upload
    // (surfacing as a CORS / network error in the browser). Force checksums to
    // only be applied when a command explicitly requires them, keeping the
    // presigned URL clean so the browser can upload with just Content-Type.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: env.storage.accessKeyId,
      secretAccessKey: env.storage.secretAccessKey,
    },
  });
  return cached;
}
