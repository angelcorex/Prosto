import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Bot API token scheme.
 *
 * Format:  pb_<tokenId>.<secret>
 *   - tokenId  — the bot_tokens.id (uuid, no dashes), an INDEXED lookup key so
 *                verification is a single-row fetch, not a table scan of hashes.
 *   - secret   — 32 random bytes, base64url. Never stored; shown to the
 *                developer exactly once at creation time.
 *
 * Only `sha256(secret [+ pepper])` is persisted (bot_tokens.token_hash). Even a
 * full DB dump cannot recover a usable token — the pepper (an optional
 * server-only secret) never leaves the server, and sha256 of 32 random bytes is
 * not brute-forceable. Verification is timing-safe.
 *
 * This mirrors the "show once, store a hash" model used by GitHub PATs, Stripe
 * restricted keys, and Discord bot tokens.
 */

const PREFIX = 'pb_';
const SECRET_BYTES = 32;

/**
 * Optional pepper. Defaults to a value derived from the service-role key (a
 * server-only secret that already gates everything), so tokens are peppered by
 * default with zero extra configuration — same philosophy as
 * `lib/accounts/crypto.ts`.
 */
function pepper(): string {
  const secret = process.env.BOT_TOKEN_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return `prosto:bot-token:v1:${secret}`;
}

/** Hash a token secret for storage / comparison. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(`${pepper()}:${secret}`).digest('hex');
}

export interface GeneratedToken {
  /** The full plaintext token — return to the developer ONCE, never persist. */
  token: string;
  /** bot_tokens.id embedded in the token (indexed lookup key). */
  tokenId: string;
  /** sha256 to store in bot_tokens.token_hash. */
  tokenHash: string;
  /** Short display hint stored in bot_tokens.token_prefix, e.g. "pb_1a2b3c…". */
  prefix: string;
}

/**
 * Mint a new token for a freshly-inserted bot_tokens row. Pass the row's uuid.
 */
export function generateToken(tokenId: string): GeneratedToken {
  const id = tokenId.replace(/-/g, '');
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const token = `${PREFIX}${id}.${secret}`;
  return {
    token,
    tokenId,
    tokenHash: hashSecret(secret),
    prefix: `${PREFIX}${id.slice(0, 6)}…`,
  };
}

export interface ParsedToken {
  /** Canonical uuid (dashed) of the bot_tokens row. */
  tokenId: string;
  secret: string;
}

/** Parse a bearer token into its id + secret parts, or null when malformed. */
export function parseToken(raw: string): ParsedToken | null {
  if (!raw.startsWith(PREFIX)) return null;
  const body = raw.slice(PREFIX.length);
  const dot = body.indexOf('.');
  if (dot <= 0) return null;
  const idHex = body.slice(0, dot);
  const secret = body.slice(dot + 1);
  // 32 hex chars = a uuid without dashes.
  if (!/^[0-9a-f]{32}$/i.test(idHex) || secret.length < 20) return null;
  const tokenId = [
    idHex.slice(0, 8), idHex.slice(8, 12), idHex.slice(12, 16),
    idHex.slice(16, 20), idHex.slice(20, 32),
  ].join('-');
  return { tokenId, secret };
}

/** Timing-safe comparison of a candidate secret against a stored hash. */
export function verifySecret(secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashSecret(secret), 'utf8');
  const expected = Buffer.from(storedHash, 'utf8');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
