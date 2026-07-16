import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n';
import { site } from '@/config';
import { loadServerInvite } from '@/features/servers/invites/invite-data';
import { SInviteClient } from '@/app/sinvite/[token]/sinvite-client';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const inv = await loadServerInvite(token);
  const t = await getT('servers');
  const name = inv?.name ?? '';
  const title = inv ? t('ogTitle', { name }) : t('ogTitleGeneric');
  const description = inv ? t('ogDesc', { name }) : t('ogDescGeneric');
  const image = inv?.icon_url || '/favicon/prosto_logo.png';
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', images: [image], siteName: site.name },
    twitter: { card: 'summary', title, description, images: [image] },
  };
}

export default async function ServerInviteShortPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await loadServerInvite(token);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const t = await getT('servers');
  const labels = {
    question:     inv ? t('joinQuestion', { name: inv.name }) : '',
    subtitle:     t('joinSubtitle'),
    join:         t('join'),
    signIn:       t('signInCta'),
    notFound:     t('inviteNotFound'),
    members:      t('membersWord'),
    errorGeneric: t('errorGeneric'),
    banned:       t('bannedFromServer'),
  };

  return (
    <SInviteClient
      invite={inv}
      token={token}
      authed={!!user}
      signInHref={`${site.routes.signIn}?next=${encodeURIComponent(site.routes.serverInvite(token))}`}
      labels={labels}
    />
  );
}
