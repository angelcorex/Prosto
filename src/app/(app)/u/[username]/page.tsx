import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { CalendarDays, Pencil, Ban, Lock } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { getT }           from '@/lib/i18n';
import { getLocale }      from '@/lib/i18n/request';
import { createClient }   from '@/lib/supabase/server';
import { site }           from '@/config';
import { buttonClass, VerifiedBadge, EmojiText, UsernameAliases } from '@/components/ui';
import { ModeratorBadge, PremiumBadge, BotBadge } from '@/components/ui';
import { LiveStatusDot, DeviceBadge } from '@/features/presence';
import { ComposeBox, PostCard, PostText, mapFeedRow } from '@/features/posts';
import { ProfileActions, FollowStats } from '@/features/social';
import { ProfileConnections, NowPlayingCard, PROVIDERS, type PublicConnection, type ProviderId } from '@/features/connections';
import type { Post }      from '@/features/posts';
import { ProfileTabs }    from './profile-tabs';
import { BotProfile }     from './bot-profile';

interface Props {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username } = await params;
  const { tab } = await searchParams;
  const activeTab: 'posts' | 'likes' = tab === 'likes' ? 'likes' : 'posts';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const t      = await getT('profile');
  const tp     = await getT('posts');
  const locale = await getLocale();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, banner_url, pronouns, is_verified, is_moderator, is_premium, is_bot, created_at, status, last_seen, custom_status, privacy_profile')
    .eq('username', username)
    .maybeSingle();

  // Not a canonical username — it may be one of a user's additional usernames
  // (Super Prosto aliases). Resolve it and redirect to the one canonical URL so
  // every profile has a single address and all username-keyed RPCs still work.
  if (!profile) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: canonical } = await (supabase as any)
      .rpc('resolve_username', { p_handle: username });
    if (canonical && canonical !== username) redirect(site.routes.profile(canonical));
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ownProfile } = user ? await (supabase as any)
    .from('profiles')
    .select('username, id')
    .eq('id', user.id)
    .maybeSingle() : { data: null };

  // A bot is not a social actor: no follow/friend/block, no posts/followers, no
  // tabs. Render a dedicated closed profile and skip every social query below.
  if (profile.is_bot) {
    return <BotProfile profile={profile} />;
  }

  const isOwner     = !!user && user.id === profile.id;
  const initial     = (profile.display_name ?? username)[0]?.toUpperCase() ?? '?';
  const displayName = profile.display_name ?? username;

  // Social state (for non-owner)
  let isFollowing  = false;
  let friendStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted' = 'none';
  let followersCount = 0;
  let followingCount = 0;
  let isBlocked = false;
  let blockedBy = false;

  if (ownProfile && !isOwner) {
    const [followRow, friendRow, statsRow, blockRow] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('follows')
        .select('follower_id')
        .eq('follower_id', ownProfile.id)
        .eq('following_id', profile.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('friend_requests')
        .select('from_id, to_id, status')
        .or(`and(from_id.eq.${ownProfile.id},to_id.eq.${profile.id}),and(from_id.eq.${profile.id},to_id.eq.${ownProfile.id})`)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('profile_stats')
        .select('followers_count, following_count')
        .eq('id', profile.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('blocks')
        .select('blocker_id, blocked_id')
        .or(`and(blocker_id.eq.${ownProfile.id},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${ownProfile.id})`)
        .maybeSingle(),
    ]);

    isFollowing = !!followRow.data;
    followersCount = statsRow.data?.followers_count ?? 0;
    followingCount = statsRow.data?.following_count ?? 0;

    if (blockRow.data) {
      if (blockRow.data.blocker_id === ownProfile.id) isBlocked = true;
      else blockedBy = true;
    }

    if (friendRow.data) {
      if (friendRow.data.status === 'accepted') friendStatus = 'accepted';
      else if (friendRow.data.from_id === ownProfile.id) friendStatus = 'pending_sent';
      else friendStatus = 'pending_received';
    }
  } else if (ownProfile && isOwner) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stats } = await (supabase as any).from('profile_stats')
      .select('followers_count, following_count').eq('id', profile.id).maybeSingle();
    followersCount = stats?.followers_count ?? 0;
    followingCount = stats?.following_count ?? 0;
  }

  const joinedDate = profile.created_at
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
        .format(new Date(profile.created_at))
    : '';

  // Fetch posts (own + reposts) or liked posts depending on the active tab —
  // both RPCs share the same row shape so mapFeedRow/PostCard are reused.
  const postsRpc = activeTab === 'likes' ? 'get_user_liked_posts' : 'get_user_posts';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawPosts } = await (supabase as any)
    .rpc(postsRpc, { uname: username, viewer: user?.id ?? null });

  const posts: Post[] = (rawPosts ?? []).map(mapFeedRow);

  // Blocked by this user → show a minimal "you can't view this profile" screen
  // instead of their content (posts are already withheld server-side too).
  if (blockedBy) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Ban className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold">{t('blockedTitle')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t('blockedByBody')}</p>
        <Link href={site.routes.feed} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          {t('backToFeed')}
        </Link>
      </div>
    );
  }

  // Privacy gate: honour privacy_profile ('everyone' | 'friends' | 'nobody').
  // Owner always sees themselves; non-owners must pass the same check the DB
  // enforces (are_friends for 'friends', nobody for 'nobody'). Anonymous only
  // sees 'everyone'. Blocked is handled above and takes precedence.
  const lvl = (profile.privacy_profile ?? 'everyone') as 'everyone' | 'friends' | 'nobody';
  const canView =
    isOwner ||
    lvl === 'everyone' ||
    (lvl === 'friends' && friendStatus === 'accepted');
  if (!canView) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold">{t('hiddenTitle')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {lvl === 'friends' ? t('hiddenBodyFriends') : t('hiddenBody')}
        </p>
        <Link href={site.routes.feed} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          {t('backToFeed')}
        </Link>
      </div>
    );
  }

  // Linked accounts shown publicly on the profile (Spotify, etc.).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: connRows } = await (supabase as any)
    .rpc('get_profile_connections', { p_username: username });
  const connections: PublicConnection[] = connRows ?? [];
  // Any connected provider with a live "now playing" card (Spotify, Ataraxis).
  const statusProviders = connections
    .filter((c) => PROVIDERS[c.provider as ProviderId]?.hasStatus)
    .map((c) => c.provider as ProviderId);

  // Additional usernames (Super Prosto) — shown as extra @handles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aliasRows } = await (supabase as any)
    .rpc('get_profile_usernames', { p_username: username });
  const additionalUsernames: string[] = (aliasRows ?? []).map((r: { username: string }) => r.username);

  return (
    <div className="mx-auto w-full max-w-2xl md:pb-10">

      {/* ── Banner ── */}
      <div className="relative mx-4 mt-4 h-44 overflow-hidden rounded-2xl sm:h-52">
        {profile.banner_url ? (
          <Image
            src={profile.banner_url}
            alt=""
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
      </div>

      {/* ── Avatar row ── Actions sit inline on the right at sm+, but wrap to a
          full-width bar below the avatar on phones (see flex-wrap + w-full). */}
      <div className="mx-6 -mt-14 flex flex-wrap items-end justify-between gap-3">
        <div className="relative shrink-0">
          <div className="relative h-[100px] w-[100px] overflow-hidden rounded-full bg-link/20 ring-4 ring-background">
            {profile.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt={displayName}
                sizes="100px"
                className="object-cover"
                animate
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-link">
                {initial}
              </span>
            )}
          </div>
          <span className="absolute bottom-1 right-1 rounded-full border-2 border-background">
            <LiveStatusDot id={profile.id} status={profile.status} lastSeen={profile.last_seen} className="h-3.5 w-3.5" />
          </span>
        </div>

        {isOwner && (
          <Link href="/settings/profile" className={`${buttonClass({ variant: 'outline', size: 'sm' })} h-10 w-full justify-center sm:h-9 sm:w-auto`}>
            <Pencil className="h-4 w-4" />
            {t('editProfile')}
          </Link>
        )}
        {!isOwner && ownProfile && (
          <div className="w-full sm:w-auto">
            <ProfileActions
              targetId={profile.id}
              targetUsername={username}
              isFollowing={isFollowing}
              friendStatus={friendStatus}
              isBlocked={isBlocked}
              blockedBy={blockedBy}
            />
          </div>
        )}
      </div>

      {/* ── Info ── */}
      <div className="mx-6 mt-4">

        {/* Name + handle + pronouns */}
        <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <h1 className="min-w-0 truncate text-2xl font-bold leading-tight"><EmojiText content={displayName} clamp className={profile.is_premium ? 'aurora-text aurora-text-glow' : undefined} /></h1>
            {profile.is_bot && <BotBadge size="md" />}
            {profile.is_verified && (
              <VerifiedBadge size="md" sinceDate={profile.created_at} />
            )}
            {profile.is_moderator && <ModeratorBadge size="md" />}
            {profile.is_premium && <PremiumBadge size="md" />}
            {!profile.is_bot && <DeviceBadge userId={profile.id} />}
          </span>
          <span className="text-[15px] text-muted-foreground">@{username}</span>
          <UsernameAliases
            aliases={additionalUsernames}
            displayName={displayName}
            avatarUrl={profile.avatar_url}
            className="text-[15px]"
          />
          {profile.pronouns?.trim() && (
            <>
              <span className="text-xs text-muted-foreground/40">·</span>
              <EmojiText content={profile.pronouns.trim()} className="text-[15px] text-muted-foreground/70" />
            </>
          )}
        </div>

        {/* Custom status */}
        {profile.custom_status?.trim() && (
          <p className="mb-3 text-[15px] text-foreground/70">
            <EmojiText content={profile.custom_status.trim()} />
          </p>
        )}

        {/* Bio */}
        {profile.bio ? (
          <PostText content={profile.bio} className="mb-4 text-[15px] text-foreground/80" />
        ) : isOwner ? (
          <p className="mb-4 text-[15px] italic text-muted-foreground">{t('noBio')}</p>
        ) : null}

        {/* Stats */}
        <FollowStats username={username} followers={followersCount} following={followingCount} />

        {/* Joined */}
        {joinedDate && (
          <div className="mb-5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span>{t('joined')} {joinedDate}</span>
          </div>
        )}

        {/* Now playing + connections */}
        {statusProviders.map((p) => (
          <NowPlayingCard key={p} username={username} provider={p} className="mt-1" />
        ))}
        <ProfileConnections connections={connections} />

        {/* Tabs */}
        <ProfileTabs active={activeTab} postsLabel={t('posts')} likesLabel={t('likes')} />
      </div>

      {/* ── Compose (owner only, posts tab) ── */}
      {isOwner && activeTab === 'posts' && (
        <div className="mx-4 mt-4">
          <ComposeBox
            avatarUrl={profile.avatar_url}
            username={username}
            isPremium={profile.is_premium}
          />
        </div>
      )}

      {/* ── Posts / Likes ── */}
      <div className="mx-4 mt-1">
        {posts.length > 0 ? (
          posts.map(post => (
            <PostCard key={`${post.id}-${post.reposter?.username ?? 'own'}`} post={post} locale={locale} currentUsername={ownProfile?.username ?? null} />
          ))
        ) : (
          <p className="py-12 text-center text-[15px] text-muted-foreground">
            {activeTab === 'likes' ? t('noLikes') : tp('noPosts')}
          </p>
        )}
      </div>

    </div>
  );
}
