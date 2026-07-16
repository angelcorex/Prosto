import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BotEditor, type BotDetail, type BotServerRow } from '@/features/developers';

export const dynamic = 'force-dynamic';

/**
 * Bot management page. Ownership is verified here (bots.owner_id === me) before
 * any data is loaded; the service-role client then gathers tokens/commands/
 * server membership. A non-owner gets a 404.
 */
export default async function BotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: bot } = await sb
    .from('bots')
    .select('id, owner_id, description, is_active, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!bot || bot.owner_id !== user.id) notFound();

  const [{ data: profile }, { data: tokens }, { data: commands }, { data: memberRows }, { data: ownedServers }] =
    await Promise.all([
      sb.from('profiles').select('username, display_name, avatar_url').eq('id', id).single(),
      sb.from('bot_tokens').select('id, token_prefix, name, created_at, last_used_at, revoked_at').eq('bot_id', id).order('created_at', { ascending: false }),
      sb.from('bot_commands').select('id, name, description, options').eq('bot_id', id).order('name'),
      sb.from('server_members').select('server_id, servers(id, name, icon_url, public_id, owner_id)').eq('profile_id', id),
      sb.from('servers').select('id, name, icon_url, public_id').eq('owner_id', user.id),
    ]);

  const memberServers: BotServerRow[] = (memberRows ?? [])
    .map((r: Record<string, unknown>) => r.servers as Record<string, unknown> | null)
    .filter(Boolean)
    .map((s: Record<string, unknown>) => ({
      id: s.id as string, name: s.name as string,
      icon_url: (s.icon_url as string) ?? null, public_id: String(s.public_id),
    }));

  const memberIds = new Set(memberServers.map((s) => s.id));
  const ownerServers: BotServerRow[] = (ownedServers ?? [])
    .filter((s: Record<string, unknown>) => !memberIds.has(s.id as string))
    .map((s: Record<string, unknown>) => ({
      id: s.id as string, name: s.name as string,
      icon_url: (s.icon_url as string) ?? null, public_id: String(s.public_id),
    }));

  const detail: BotDetail = {
    id,
    username: profile?.username ?? '',
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
    description: bot.description ?? null,
    is_active: bot.is_active,
    created_at: bot.created_at,
    tokens: tokens ?? [],
    commands: (commands ?? []).map((c: Record<string, unknown>) => ({
      id: c.id as string, name: c.name as string,
      description: (c.description as string) ?? '',
      options: Array.isArray(c.options) ? c.options : [],
    })),
    memberServers,
    ownerServers,
  };

  return <BotEditor bot={detail} />;
}
