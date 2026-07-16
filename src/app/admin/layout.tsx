import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser, getCurrentProfile } from '@/lib/supabase/server';
import { getLocale } from '@/lib/i18n';
import { site } from '@/config';
import { AdminShell } from '@/features/admin';

export const metadata: Metadata = {
  title: 'Admin — Prosto',
  // Never index the operator console.
  robots: { index: false, follow: false },
};

/**
 * Admin route-group guard (layer 2 of 3, see [[security-model]]):
 *   1. proxy.ts rejects /admin without a session (fast edge reject).
 *   2. THIS layout: signed in + is_admin, else redirect to the feed.
 *   3. every admin_* RPC re-checks is_admin(auth.uid()) in Postgres.
 * A non-admin who somehow reaches a page still gets no data — the RPCs raise.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(site.routes.signIn);

  const profile = await getCurrentProfile();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(profile as any)?.is_admin) redirect(site.routes.feed);

  const locale = await getLocale();

  return <AdminShell locale={locale}>{children}</AdminShell>;
}
