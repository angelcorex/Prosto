import type { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n';
import { site } from '@/config';
import { InviteClient, type InvitePreview } from './invite-client';

async function loadInvite(token: string): Promise<InvitePreview | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('get_friend_invite', { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const inv = await loadInvite(token);
  const t = await getT('invite');

  // Always emit an OG card so the link previews nicely on social — even if the
  // inviter couldn't be resolved (fall back to a generic invite card).
  const name = inv ? (inv.display_name?.trim() || inv.username) : '';
  const title = inv ? t('ogTitle', { name }) : t('ogTitleGeneric');
  const description = inv ? t('ogDesc', { name }) : t('ogDescGeneric');
  const image = inv?.avatar_url || '/favicon/prosto_logo.png';

  return {
    title,
    description,
    openGraph: { title, description, type: 'website', images: [image], siteName: site.name },
    twitter: { card: 'summary', title, description, images: [image] },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await loadInvite(token);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const t = await getT('invite');
  const labels = {
    addQuestion: inv ? t('question', { name: inv.display_name?.trim() || inv.username }) : '',
    subtitle:    t('subtitle'),
    yes:         t('yes'),
    no:          t('no'),
    signIn:      t('signInCta'),
    notFound:    t('notFound'),
    self:        t('self'),
    adding:      t('adding'),
    errorSelf:   t('errorSelf'),
    errorBlocked: t('errorBlocked'),
    errorGeneric: t('errorGeneric'),
  };

  return (
    <InviteClient
      token={token}
      invite={inv}
      authed={!!user}
      isSelf={!!user && !!inv && inv.inviter_id === user.id}
      signInHref={`${site.routes.signIn}?next=${encodeURIComponent(site.routes.invite(token))}`}
      labels={labels}
    />
  );
}
