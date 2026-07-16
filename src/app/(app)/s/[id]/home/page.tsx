import { redirect } from 'next/navigation';

import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { site } from '@/config';
import { ServerHome } from '@/features/servers';

const MANAGE_SERVER = 4;

export default async function ServerHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(site.routes.signIn);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: srv } = await (supabase as any).rpc('get_server', { p_public_id: id });
  const server = Array.isArray(srv) ? srv[0] : srv;
  if (!server) redirect(site.routes.feed);

  const canManage = !!server.is_owner || ((Number(server.my_permissions) || 0) & MANAGE_SERVER) !== 0;

  return (
    <ServerHome
      serverId={server.id}
      publicId={String(server.public_id)}
      name={server.name}
      icon={server.icon_url ?? null}
      banner={server.banner_url ?? null}
      homeBanner={server.home_banner ?? null}
      homeWhiteboard={server.home_whiteboard ?? null}
      description={server.description ?? null}
      memberCount={Number(server.member_count) || 0}
      isVerified={!!server.is_verified}
      canManage={canManage}
    />
  );
}
