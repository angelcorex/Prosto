import type { NextRequest } from 'next/server';

import { authenticateBot, apiOk, apiError, rpcError } from '@/lib/bots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/interactions/:token/respond — answer a slash-command interaction.
 *
 * Body: { content }
 * The `:token` is the single-use response_token handed out by the poll. The RPC
 * posts the reply to the originating channel/DM as the bot and marks the
 * interaction responded (idempotency: a second call returns 409).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return apiError(auth.status, auth.code);

  const { token } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return apiError(400, 'invalid_token_format');

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'invalid_json');
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return apiError(400, 'content_required');
  if (content.length > 4000) return apiError(400, 'content_too_long');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.admin as any;
  const { data, error } = await sb.rpc('bot_reply_interaction', {
    p_bot: auth.bot.botId, p_token: token, body: content,
  });
  if (error) return rpcError(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return apiOk({ message: { id: row?.msg_id, createdAt: row?.msg_created_at } }, 201);
}
