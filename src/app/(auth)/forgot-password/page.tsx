import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { AuthCard, ForgotPasswordForm } from '@/features/auth';
import { site } from '@/config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth.forgot');
  return { title: t('title') };
}

export default async function ForgotPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(site.routes.feed);

  const t = await getT('auth.forgot');

  return (
    <AuthCard
      title={t('title')}
      footer={
        <Link href={site.routes.signIn} className="font-medium text-link hover:underline">
          {t('backToSignIn')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}