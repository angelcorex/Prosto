import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { site } from '@/config';
import { AccountSettings } from './account-settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('account');
  return { title: t('title') };
}

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(site.routes.signIn);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  const username = profile?.username ?? user.email?.split('@')[0] ?? 'user';

  return <AccountSettings username={username} email={user.email ?? ''} />;
}
