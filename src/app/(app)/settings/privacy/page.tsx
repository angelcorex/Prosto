import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { site } from '@/config';
import { PrivacySettings, type PrivacyLevel } from '@/features/settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('settings.privacy');
  return { title: t('title') };
}

export default async function PrivacySettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(site.routes.signIn);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('get_privacy_settings');
  const row = Array.isArray(data) ? data[0] : data;
  const initial = {
    privacy_profile:    (row?.privacy_profile    ?? 'everyone') as PrivacyLevel,
    privacy_messages:   (row?.privacy_messages   ?? 'everyone') as PrivacyLevel,
    privacy_friend_req: (row?.privacy_friend_req ?? 'everyone') as PrivacyLevel,
  };

  return <PrivacySettings initial={initial} />;
}
