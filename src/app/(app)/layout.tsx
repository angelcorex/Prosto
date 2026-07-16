import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { getCurrentUser, getCurrentProfile } from '@/lib/supabase/server';
import { site } from '@/config';
import { IconRail } from '@/components/shell/icon-rail';
import { AppShell } from '@/components/shell/app-shell';
import { UserPanel, MobileTabBar, MobileBackButton } from '@/components/shell';
import { ContextSearch } from '@/components/shell/context-search';
import { DmSidebar } from './messages/dm-sidebar';
import { HeartbeatMount } from '@/features/presence/heartbeat-mount';
import { AuthWatcher } from '@/features/auth';
import { DesktopBadge, DownloadDesktopButton } from '@/features/desktop';
import { FaviconBadge, MessageNotifier } from '@/features/notifications';
import { GroupRightPanel } from '@/features/groups';
import { ServerSidebar, ServerMembersPanel } from '@/features/servers';
import { AppLoader } from '@/components/shell/app-loader';
import { AgeProvider, BirthDateModal } from '@/features/age';
import { MobileComposer } from '@/features/posts';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(site.routes.signIn);

  const profile = await getCurrentProfile();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Only the REAL profile username may build /u/... links. Never fall back to
  // the email local-part — it can match another account's username and open
  // the wrong profile ("my profile" showing a stranger). When it's missing,
  // the nav points to /settings/profile so the user can finish their profile.
  const username: string | null    = profile?.username     ?? null;
  const avatarUrl: string | null   = profile?.avatar_url   ?? null;
  const bannerUrl: string | null   = profile?.banner_url   ?? null;
  const displayName: string | null = profile?.display_name ?? null;
  const pronouns: string | null    = profile?.pronouns     ?? null;
  const bio: string | null         = profile?.bio          ?? null;
  const isVerified: boolean        = profile?.is_verified  ?? false;
  const isModerator: boolean       = profile?.is_moderator ?? false;
  const isPremium: boolean         = profile?.is_premium   ?? false;
  const status: string | null      = profile?.status       ?? 'online';
  const customStatus: string | null = profile?.custom_status ?? null;
  const lastSeen: string | null    = profile?.last_seen    ?? null;
  const birthDate: string | null   = profile?.birth_date   ?? null;

  const userPanel = (
    <UserPanel
      username={username}
      userId={user.id}
      avatarUrl={avatarUrl}
      bannerUrl={bannerUrl}
      displayName={displayName}
      pronouns={pronouns}
      bio={bio}
      isVerified={isVerified}
      isModerator={isModerator}
      isPremium={isPremium}
      status={status}
      lastSeen={lastSeen}
      customStatus={customStatus}
    />
  );

  return (
    <>
      <script
        nonce={nonce}
        // Account-switch hygiene: if the signed-in user changed since the last
        // load on this device, wipe account-scoped client state (open tabs,
        // server-rail cache, composer drafts, post-view markers) BEFORE anything
        // reads it — so a switched/added account starts clean with no leftover
        // data or flicker from the previous one. Global prefs (theme, platform
        // style, locale) live under other keys and are intentionally kept.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `try{var u=${JSON.stringify(user.id)},k='prosto:uid',p=localStorage.getItem(k);if(p&&p!==u){sessionStorage.clear();localStorage.removeItem('prosto:tabs:v1');localStorage.removeItem('prosto:folders:expanded');}localStorage.setItem(k,u);}catch(e){}`,
        }}
      />
      <HeartbeatMount />
      <AuthWatcher />
      <DesktopBadge />
      <FaviconBadge />
      <MessageNotifier />
      <MobileBackButton />
      <MobileComposer />
      <AgeProvider birthDate={birthDate}>
      <BirthDateModal />
      <AppLoader>
      <AppShell
        iconRail={<IconRail myUsername={username} />}
        userPanel={userPanel}
        dmSidebar={<DmSidebar />}
        rightPanel={
          <GroupRightPanel
            search={
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><ContextSearch myUsername={username} myDisplayName={displayName} myAvatar={avatarUrl} /></div>
                <DownloadDesktopButton />
              </div>
            }
            footer={null}
          />
        }
        serverSidebar={<ServerSidebar />}
        serverRightPanel={
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center gap-2 px-4 pt-5">
              <div className="min-w-0 flex-1"><ContextSearch myUsername={username} myDisplayName={displayName} myAvatar={avatarUrl} /></div>
              <DownloadDesktopButton />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden border-t border-border/20">
              <ServerMembersPanel />
            </div>
          </div>
        }
        mobileNav={<MobileTabBar username={username} avatarUrl={avatarUrl} />}
      >
        {children}
      </AppShell>
      </AppLoader>
      </AgeProvider>
    </>
  );
}
