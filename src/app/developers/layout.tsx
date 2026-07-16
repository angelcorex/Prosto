import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { getCurrentUser } from '@/lib/supabase/server';
import { getLocale } from '@/lib/i18n';
import { PortalShell } from '@/features/developers';

export const metadata: Metadata = {
  title: 'Developers — Prosto',
};

/**
 * Developer-portal shell. The DOCS are public (anyone can read them without an
 * account); the portal PAGES (bots list, bot editor) guard themselves — the
 * page loaders redirect to sign-in and every privileged action is owner-guarded
 * in SQL. So there's no auth gate here; we just pass whether the visitor is
 * signed in so the shell can adapt its nav.
 */
export default async function DevelopersLayout({ children }: { children: ReactNode }) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  return <PortalShell locale={locale} authed={!!user}>{children}</PortalShell>;
}
