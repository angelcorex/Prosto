import type { NextRequest } from 'next/server';

import { authenticateBot, apiOk, apiError } from '@/lib/bots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me — identity check. Returns the authenticated bot's profile so a
 * bot can confirm its token works and learn its own id/username on startup.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return apiError(auth.status, auth.code);

  return apiOk({
    bot: {
      id: auth.bot.botId,
      username: auth.bot.username,
      displayName: auth.bot.displayName,
      avatarUrl: auth.bot.avatarUrl,
    },
  });
}
