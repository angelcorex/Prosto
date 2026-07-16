import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getT } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/request';
import { createClient } from '@/lib/supabase/server';
import { site } from '@/config';
import { AppearanceSettings } from './appearance-settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('settings');
  return { title: t('appearance') };
}

export default async function AppearanceSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(site.routes.signIn);

  const locale = await getLocale();

  return <AppearanceSettings locale={locale} />;
}
