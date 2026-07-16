import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { AuthCard, ResetPasswordForm } from '@/features/auth';
import { site } from '@/config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('auth.reset');
  return { title: t('title') };
}

export default async function ResetPasswordPage() {
  // The recovery link established a session via /auth/confirm. Without it there
  // is nothing to reset — send the user back to request a fresh link.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(site.routes.forgotPassword);

  const t = await getT('auth.reset');

  return (
    <AuthCard
      title={t('title')}
      footer={
        <Link href={site.routes.signIn} className="font-medium text-link hover:underline">
          {t('backToSignIn')}
        </Link>
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
