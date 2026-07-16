import type { NextRequest } from 'next/server';

import { authenticateBot, apiOk, apiError, rpcError } from '@/lib/bots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/messages — send a message as the bot.
 *
 * Body: { channelId?, conversationId?, content, replyTo? }
 * Exactly one of channelId / conversationId must be set. The message is posted
 * via a service-role-only RPC that re-checks membership + permissions, so a bot
 * can only post where it's actually a member with SEND_MESSAGES.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return apiError(auth.status, auth.code);

  let body: {
    channelId?: string; conversationId?: string; content?: string; replyTo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'invalid_json');
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return apiError(400, 'content_required');
  if (content.length > 4000) return apiError(400, 'content_too_long');

  const hasChannel = typeof body.channelId === 'string' && body.channelId;
  const hasConv = typeof body.conversationId === 'string' && body.conversationId;
  if (hasChannel === hasConv) return apiError(400, 'target_required'); // need exactly one

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.admin as any;
  const reply = typeof body.replyTo === 'string' ? body.replyTo : null;

  if (hasChannel) {
    const { data, error } = await sb.rpc('bot_send_channel_message', {
      p_bot: auth.bot.botId, p_channel: body.channelId, body: content, reply,
    });
    if (error) return rpcError(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return apiOk({ message: { id: row?.msg_id, createdAt: row?.msg_created_at } }, 201);
  }

  const { data, error } = await sb.rpc('bot_send_dm', {
    p_bot: auth.bot.botId, conv_id: body.conversationId, body: content, reply,
  });
  if (error) return rpcError(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return apiOk({ message: { id: row?.id, createdAt: row?.created_at } }, 201);
}
