import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { AuthCard, SignUpForm, SignUpVideo } from '@/features/auth';
import { site } from '@/config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth.signUp');
  return { title: t('title') };
}

export default async function SignUpPage({
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

  const t = await getT('auth.signUp');

  return (
    <div className="flex items-center justify-center gap-10 xl:gap-14">
      <AuthCard
        title={t('title')}
        footer={
          <>
            {t('hasAccount')}{' '}
            <Link href={safeNext ? `${site.routes.signIn}?next=${encodeURIComponent(safeNext)}` : site.routes.signIn} className="font-medium text-link hover:underline">
              {t('signIn')}
            </Link>
          </>
        }
      >
        <SignUpForm next={safeNext} />
      </AuthCard>

      <SignUpVideo />
    </div>
  );
}
