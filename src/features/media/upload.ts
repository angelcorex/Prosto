'use client';

import { imageToWebp } from './webp';
import type { PendingFile } from './use-chat-attachments';

export interface UploadProgress {
  /** 0–100. Fires incrementally as bytes leave the browser. */
  percent: number;
}

export interface UploadResult {
  url: string | null;
  error?: string;
}

const UPLOAD_ENDPOINT = '/api/upload';
const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

type UploadBucket = 'chat' | 'posts' | 'servers' | 'avatars';

interface UploadOptions {
  onProgress?: (p: UploadProgress) => void;
  bucket?: UploadBucket;
  /** Skip WebP conversion (non-image files). */
  skipConvert?: boolean;
}

/**
 * Upload one file to `/api/upload` (same-origin route handler → object storage).
 *
 * Uses XHR so the caller gets real `upload.onprogress` events for a progress
 * bar, and so large files aren't capped by the Server Action body limit.
 * Still images are converted to WebP first (smaller payload); video and other
 * files are sent as-is.
 */
export function uploadDirect(file: File, opts: UploadOptions = {}): Promise<UploadResult> {
  const isVideo = file.type.startsWith('video/');
  const prepared = opts.skipConvert || isVideo ? Promise.resolve(file) : imageToWebp(file);

  return prepared.then(
    (toUpload) =>
      new Promise<UploadResult>((resolve) => {
        // Raw body upload (not multipart): metadata rides in the query string +
        // Content-Type header so the server can stream the body straight to
        // storage without a multipart parser (which caps/fails on large files).
        const params = new URLSearchParams({ name: toUpload.name });
        if (opts.bucket) params.set('bucket', opts.bucket);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${UPLOAD_ENDPOINT}?${params.toString()}`);
        xhr.setRequestHeader('Content-Type', toUpload.type || 'application/octet-stream');
        xhr.timeout = UPLOAD_TIMEOUT_MS;

        if (opts.onProgress) {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              opts.onProgress!({ percent: Math.round((e.loaded / e.total) * 100) });
            }
          });
        }

        xhr.addEventListener('load', () => {
          let body: { url?: string; error?: string } = {};
          try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
          if (xhr.status >= 200 && xhr.status < 300 && body.url) {
            opts.onProgress?.({ percent: 100 });
            resolve({ url: body.url });
          } else {
            console.error('[uploadDirect] HTTP', xhr.status, body.error ?? '', `size=${file.size} type=${file.type}`);
            resolve({ url: null, error: body.error ?? 'upload_failed' });
          }
        });
        xhr.addEventListener('error', () => resolve({ url: null, error: 'upload_failed' }));
        xhr.addEventListener('timeout', () => resolve({ url: null, error: 'timeout' }));

        xhr.send(toUpload);
      }),
  );
}

/**
 * Upload all pending files in parallel; returns an ordered list of public URLs
 * (null for any that failed).
 */
export async function uploadPendingFiles(
  pending: PendingFile[],
  opts: { onProgress?: (p: UploadProgress) => void; bucket?: UploadBucket } = {},
): Promise<(string | null)[]> {
  if (pending.length === 0) return [];
  const results = await Promise.all(
    pending.map((p) => uploadDirect(p.file, { onProgress: opts.onProgress, bucket: opts.bucket })),
  );
  return results.map((r) => r.url);
}
