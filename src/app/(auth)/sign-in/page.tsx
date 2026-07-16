import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { AuthCard, SignInForm } from '@/features/auth';
import { site } from '@/config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth.signIn');
  return { title: t('title') };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined;

  // Already signed in? Never show the auth pages again (back button / direct URL).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(safeNext ?? site.routes.feed);

  const t = await getT('auth.signIn');

  return (
    <AuthCard
      title={t('title')}
      footer={
        <>
          {t('noAccount')}{' '}
          <Link href={safeNext ? `${site.routes.signUp}?next=${encodeURIComponent(safeNext)}` : site.routes.signUp} className="font-medium text-link hover:underline">
            {t('createAccount')}
          </Link>
        </>
      }
    >
      <SignInForm next={safeNext} />
    </AuthCard>
  );
}
