import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getT } from '@/lib/i18n';
import { createClient, getOwnBirthDate } from '@/lib/supabase/server';
import { site } from '@/config';
import { EditProfileForm, UsernameManager } from '@/features/profile';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('settings');
  return { title: t('title') };
}

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(site.routes.signIn);

  const t = await getT('settings');

  // Load profile — select only columns guaranteed to exist. birth_date is PII;
  // it is read via the get_my_birth_date() DEFINER accessor (column-level SELECT
  // is revoked from the client roles — see migration 124), not selected here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: profile }, birthDate] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('profiles')
      .select('username, display_name, bio, avatar_url, banner_url, avatar_pos, banner_pos, pronouns, is_premium')
      .eq('id', user.id)
      .maybeSingle(),
    getOwnBirthDate(supabase, user.id),
  ]);

  const username = profile?.username ?? user.email?.split('@')[0] ?? 'user';

  // Additional usernames (Super Prosto). RPC returns [] for free users.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aliasRows } = await (supabase as any).rpc('list_my_usernames');
  const additionalUsernames: string[] = (aliasRows ?? []).map((r: { username: string }) => r.username);

  return (
    <>
      <h1 className="mb-1 text-lg font-bold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>

      <EditProfileForm
        initialUsername={username}
        initialDisplayName={profile?.display_name}
        initialBio={profile?.bio}
        initialAvatarUrl={profile?.avatar_url}
        initialBannerUrl={profile?.banner_url}
        initialAvatarPos={profile?.avatar_pos}
        initialBannerPos={profile?.banner_pos}
        initialPronouns={profile?.pronouns}
        initialBirthDate={birthDate}
        isPremium={!!profile?.is_premium}
      />

      {/* Additional usernames — Super Prosto (up to 5 total). */}
      <div className="my-8 h-px bg-border/50" />
      <UsernameManager
        primaryUsername={username}
        initialUsernames={additionalUsernames}
        maxTotal={5}
        isPremium={!!profile?.is_premium}
      />
    </>
  );
}
