import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { site } from '@/config';
import { ConnectionsSettings, type Connection } from '@/features/connections';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('connections');
  return { title: t('title') };
}

export default async function ConnectionsSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(site.routes.signIn);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('get_my_connections');
  const connections: Connection[] = data ?? [];

  return <ConnectionsSettings connections={connections} />;
}
