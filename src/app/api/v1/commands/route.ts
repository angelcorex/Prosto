import type { NextRequest } from 'next/server';

import { authenticateBot, apiOk, apiError } from '@/lib/bots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const OPTION_TYPES = new Set(['string', 'integer', 'boolean', 'user']);

interface CmdOption {
  name: string;
  description?: string;
  type?: string;
  required?: boolean;
}
interface CmdInput {
  name: string;
  description?: string;
  options?: CmdOption[];
}

/**
 * GET /api/v1/commands — list the bot's registered slash commands.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return apiError(auth.status, auth.code);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.admin as any;
  const { data } = await sb
    .from('bot_commands')
    .select('name, description, options')
    .eq('bot_id', auth.bot.botId)
    .order('name');
  return apiOk({ commands: data ?? [] });
}

/**
 * PUT /api/v1/commands — declarative bulk sync of the bot's slash commands
 * (code-first, like Discord's PUT application commands). The posted array
 * becomes the complete command set: new ones inserted, existing ones updated,
 * omitted ones removed. Body: { commands: [{ name, description, options }] }.
 */
export async function PUT(req: NextRequest) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return apiError(auth.status, auth.code);

  let body: { commands?: CmdInput[] };
  try {
    body = await req.json();
  } catch {
    return apiError(400, 'invalid_json');
  }
  if (!Array.isArray(body.commands)) return apiError(400, 'commands_required');
  if (body.commands.length > 100) return apiError(400, 'too_many_commands');

  const clean: { name: string; description: string; options: CmdOption[] }[] = [];
  const seen = new Set<string>();
  for (const c of body.commands) {
    const name = typeof c?.name === 'string' ? c.name.toLowerCase() : '';
    if (!NAME_RE.test(name)) return apiError(400, 'invalid_command_name', name);
    if (seen.has(name)) return apiError(400, 'duplicate_command', name);
    seen.add(name);

    const options: CmdOption[] = Array.isArray(c.options)
      ? c.options.slice(0, 25).map((o) => ({
          name: String(o?.name ?? '').toLowerCase().slice(0, 32),
          description: String(o?.description ?? '').slice(0, 200),
          type: OPTION_TYPES.has(String(o?.type)) ? String(o?.type) : 'string',
          required: !!o?.required,
        }))
      : [];
    for (const o of options) {
      if (!NAME_RE.test(o.name)) return apiError(400, 'invalid_option_name', o.name);
    }
    clean.push({ name, description: String(c.description ?? '').slice(0, 200), options });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.admin as any;
  // Declarative full-set sync for a single-writer bot: clear the bot's commands,
  // then insert exactly the posted set. Simpler and more predictable than a
  // diff, and safe because only this bot's rows are touched.
  const { error: delErr } = await sb.from('bot_commands').delete().eq('bot_id', auth.bot.botId);
  if (delErr) return apiError(500, 'sync_failed');
  if (clean.length) {
    const rows = clean.map((c) => ({
      bot_id: auth.bot.botId, name: c.name, description: c.description, options: c.options,
    }));
    const { error } = await sb.from('bot_commands').insert(rows);
    if (error) return apiError(500, 'sync_failed');
  }

  return apiOk({ commands: clean });
}
