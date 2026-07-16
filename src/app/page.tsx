import { redirect } from 'next/navigation';

import { getLocale } from '@/lib/i18n';
import { site } from '@/config';
import { LandingPage } from '@/features/landing';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Authenticated users go straight to the feed.
  if (user) redirect(site.routes.feed);

  const locale = await getLocale();
  return <LandingPage locale={locale} />;
}
