import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit/ip';
import { parseToken, verifySecret } from './token';

/**
 * Bearer-token authentication for the public bot API (`/api/v1`).
 *
 * The browser never touches this — only a bot process holding its token does.
 * The flow:
 *   1. Parse `Authorization: Bearer pb_<id>.<secret>`.
 *   2. Fetch the bot_tokens row by the embedded id (indexed) via the
 *      service-role client (bot_tokens has no client-readable hash anyway).
 *   3. Timing-safe compare sha256(secret) to the stored hash.
 *   4. Reject revoked tokens / inactive bots.
 *   5. Best-effort touch last_used_at.
 *
 * The service-role client is required because verification reads token_hash and
 * because every downstream bot_* RPC is service-role-only (auth lives in the
 * token, not a Postgres session).
 */

export interface BotIdentity {
  botId: string;
  tokenId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type BotAuthResult =
  | { ok: true; bot: BotIdentity; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; status: number; code: string };

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1]!.trim() : null;
}

export async function authenticateBot(req: Request): Promise<BotAuthResult> {
  const raw = bearer(req);
  if (!raw) return { ok: false, status: 401, code: 'missing_token' };

  const parsed = parseToken(raw);
  if (!parsed) return { ok: false, status: 401, code: 'invalid_token' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: tok } = await sb
    .from('bot_tokens')
    .select('id, bot_id, token_hash, revoked_at')
    .eq('id', parsed.tokenId)
    .maybeSingle();

  if (!tok || tok.revoked_at) return { ok: false, status: 401, code: 'invalid_token' };
  if (!verifySecret(parsed.secret, tok.token_hash)) {
    return { ok: false, status: 401, code: 'invalid_token' };
  }

  // Per-bot rate limit (process-local; see [[security-model]] rate-limit notes).
  // 120 API calls / 10s per bot — generous for a long-poll loop + replies, but
  // caps a runaway bot. The long-poll GET itself is cheap and largely idle.
  const { ok } = rateLimit(`bot:${tok.bot_id}`, 120, 10_000);
  if (!ok) return { ok: false, status: 429, code: 'rate_limited' };

  const { data: prof } = await sb
    .from('profiles')
    .select('username, display_name, avatar_url, is_bot')
    .eq('id', tok.bot_id)
    .maybeSingle();
  if (!prof || !prof.is_bot) return { ok: false, status: 401, code: 'invalid_token' };

  const { data: bot } = await sb
    .from('bots')
    .select('is_active')
    .eq('id', tok.bot_id)
    .maybeSingle();
  if (!bot || !bot.is_active) return { ok: false, status: 403, code: 'bot_inactive' };

  // Best-effort last-used stamp — don't block the request on it.
  void sb.from('bot_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tok.id);

  return {
    ok: true,
    admin,
    bot: {
      botId: tok.bot_id,
      tokenId: tok.id,
      username: prof.username,
      displayName: prof.display_name ?? null,
      avatarUrl: prof.avatar_url ?? null,
    },
  };
}
