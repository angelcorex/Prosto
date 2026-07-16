import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getT } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/supabase/server';
import { site } from '@/config';
import { SuperContent } from './super-content';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('super');
  return { title: `${t('name')} — ${site.name}` };
}

export default async function SuperPage() {
  const user = await getCurrentUser();
  if (!user) redirect(site.routes.signIn);

  return <SuperContent />;
}
