import 'server-only';

import { env } from '@/lib/utils/env';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback for clients that don't render HTML. */
  text?: string;
}

/**
 * Send a transactional email through Resend's HTTP API.
 *
 * We call the REST endpoint directly with `fetch` instead of pulling in the
 * `resend` SDK — one less dependency for a single request shape. Throws on a
 * non-2xx response so callers can decide how to surface the failure.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.resend.from, to, subject, html, ...(text ? { text } : {}) }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`resend send failed: ${res.status} ${detail}`);
  }
}
