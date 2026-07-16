import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/supabase/server';
import { site } from '@/config';
import { BotsOverview, type BotSummary } from '@/features/developers';

export const dynamic = 'force-dynamic';

/** Developer portal home — the signed-in user's bots + creation. Auth-gated
 *  (the docs are public, the portal is not). */
export default async function DevelopersPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`${site.routes.signIn}?next=/developers`);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('list_my_bots');
  const bots: BotSummary[] = (data ?? []).map((b: Record<string, unknown>) => ({
    id: b.id as string,
    username: b.username as string,
    display_name: (b.display_name as string) ?? null,
    avatar_url: (b.avatar_url as string) ?? null,
    description: (b.description as string) ?? null,
    is_active: b.is_active as boolean,
    command_count: (b.command_count as number) ?? 0,
  }));

  return <BotsOverview bots={bots} />;
}
