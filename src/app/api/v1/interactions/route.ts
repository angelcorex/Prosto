import type { NextRequest } from 'next/server';

import { authenticateBot, apiOk, apiError } from '@/lib/bots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A long-poll can hold the connection for up to ~30s.
export const maxDuration = 60;

/**
 * GET /api/v1/interactions?wait=25&limit=10 — long-poll for slash-command
 * interactions.
 *
 * Returns immediately with any pending interactions. If none are pending and
 * `wait` (seconds, 0–30) is given, holds the connection and polls the queue
 * until an interaction arrives or the deadline passes, then returns (possibly
 * empty). This is the Telegram-getUpdates model: no public URL required.
 *
 * Claimed interactions are marked `delivered` server-side (FOR UPDATE SKIP
 * LOCKED), so two concurrent pollers never receive the same one.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return apiError(auth.status, auth.code);

  const params = req.nextUrl.searchParams;
  const wait = Math.min(30, Math.max(0, Number(params.get('wait')) || 0));
  const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.admin as any;
  const deadline = Date.now() + wait * 1000;
  const POLL_MS = 1500;

  for (;;) {
    const { data, error } = await sb.rpc('bot_poll_interactions', {
      p_bot: auth.bot.botId, p_limit: limit,
    });
    if (error) return apiError(500, 'poll_failed');

    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    if (rows.length > 0 || Date.now() >= deadline) {
      return apiOk({ interactions: rows.map(mapInteraction) });
    }

    // Nothing yet — wait a beat, but bail if the client disconnected.
    if (req.signal.aborted) return apiOk({ interactions: [] });
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
  }
}

function mapInteraction(r: Record<string, unknown>) {
  return {
    id: r.id,
    command: r.command_name,
    responseToken: r.response_token,
    scope: r.scope,
    channelId: r.channel_id ?? null,
    conversationId: r.conversation_id ?? null,
    serverId: r.server_id ?? null,
    options: r.options ?? {},
    invoker: { id: r.invoker_id, username: r.invoker_username },
    createdAt: r.created_at,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
