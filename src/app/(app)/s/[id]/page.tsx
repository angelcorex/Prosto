import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/supabase/server';
import { site } from '@/config';

export default async function ServerIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(site.routes.signIn);

  // Server Home is the landing page; it lives on a dedicated route so that on
  // mobile it opens as a full-screen detail view (not the channel-list screen).
  redirect(`/s/${id}/home`);
}
