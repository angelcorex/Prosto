import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption (AES-256-GCM) for the multi-account cookie.
 *
 * The cookie holds the refresh tokens of the *other* accounts a user keeps on
 * this device. It is already HttpOnly + Secure + SameSite, but we also encrypt
 * the payload so the blob is opaque and useless if the cookie is ever
 * exfiltrated from the device — the tokens can only be recovered with the
 * server key, which never leaves the server.
 *
 * The key is derived from a server-only secret. A dedicated `ACCOUNT_STORE_SECRET`
 * can be set; otherwise it's derived from the Supabase service-role key (also
 * server-only), so no extra configuration is required to be secure by default.
 */
function encryptionKey(): Buffer {
  const secret = process.env.ACCOUNT_STORE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('Missing ACCOUNT_STORE_SECRET / SUPABASE_SERVICE_ROLE_KEY for account-store encryption.');
  }
  // A fixed domain-separation label keeps this key distinct from any other use
  // of the same secret.
  return createHash('sha256').update(`prosto:account-store:v1:${secret}`).digest();
}

const IV_LEN = 12; // GCM standard nonce length
const TAG_LEN = 16;

/** Encrypt any JSON-serializable value to a compact base64url token. */
export function seal(value: unknown): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

/** Decrypt a token produced by `seal`. Returns null on any tampering/failure. */
export function open<T>(token: string): T | null {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < IV_LEN + TAG_LEN) return null;
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  } catch {
    return null;
  }
}
