import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { site } from '@/config';
import { NotificationsSettings, type NotifyPrefs } from '@/features/settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('settings.notifications');
  return { title: t('title') };
}

export default async function NotificationsSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(site.routes.signIn);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('get_notify_prefs');
  const row = Array.isArray(data) ? data[0] : data;
  const initial: NotifyPrefs = {
    sound_enabled:  row?.sound_enabled  ?? true,
    dm_sound:       row?.dm_sound       ?? true,
    server_sound:   row?.server_sound   ?? true,
    mention_sound:  row?.mention_sound  ?? true,
    friend_sound:   row?.friend_sound   ?? true,
    toasts_enabled: row?.toasts_enabled ?? true,
  };

  return <NotificationsSettings initial={initial} />;
}
