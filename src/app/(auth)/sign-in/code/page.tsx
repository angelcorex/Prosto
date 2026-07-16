import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { AuthCard, CodeLoginForm } from '@/features/auth';
import { site } from '@/config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth.code');
  return { title: t('title') };
}

export default async function CodeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(safeNext ?? site.routes.feed);

  const t = await getT('auth.code');

  return (
    <AuthCard
      title={t('title')}
      footer={
        <Link
          href={safeNext ? `${site.routes.signIn}?next=${encodeURIComponent(safeNext)}` : site.routes.signIn}
          className="font-medium text-link hover:underline"
        >
          {t('usePassword')}
        </Link>
      }
    >
      <CodeLoginForm next={safeNext} />
    </AuthCard>
  );
}
