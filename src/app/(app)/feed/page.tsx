import { getLocale }    from '@/lib/i18n/request';
import { createClient, getCurrentUser, getCurrentProfile } from '@/lib/supabase/server';
import { ComposeBox, ComposePrompt }   from '@/features/posts';
import { mapFeedRow }   from '@/features/posts';
import type { Post }    from '@/features/posts';
import { site }         from '@/config';
import { FeedClient }   from './feed-client';

export default async function FeedPage() {
  // `getCurrentUser` / `getCurrentProfile` are request-cached (React `cache`),
  // so they reuse the values the (app) layout already resolved — no extra
  // auth round-trip or profile query here. The feed posts don't depend on the
  // profile, so fetch them in PARALLEL rather than serially after it.
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [locale, profile, rawPosts] = await Promise.all([
    getLocale(),
    getCurrentProfile(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc('get_feed_posts', { viewer: user?.id ?? null, lim: 60 })
      .then((r: { data: unknown }) => r.data),
  ]);

  const posts: Post[] = (rawPosts ?? []).map(mapFeedRow);

  return (
    <div className="mx-auto w-full max-w-2xl">

      {/* Brand header — minimal wordmark */}
      <div className="flex items-center gap-2 px-4 pb-1 pt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon/prosto_logo.png" alt="" className="h-6 w-6 shrink-0 opacity-90" />
        <span className="text-[15px] font-semibold tracking-tight">{site.name}</span>
      </div>

      {/* Compose — full inline box on desktop, a tap-to-open prompt on mobile
          (the mobile full-screen composer opens from the prompt or the tab-bar
          + button). */}
      {profile && (
        <div className="px-3 pb-2 pt-1 sm:px-4">
          <div className="hidden md:block">
            <ComposeBox avatarUrl={profile.avatar_url} username={profile.username} isPremium={profile.is_premium} />
          </div>
          <div className="md:hidden">
            <ComposePrompt avatarUrl={profile.avatar_url} username={profile.username} />
          </div>
        </div>
      )}

      {/* Feed */}
      <FeedClient
        forYouPosts={posts}
        viewerId={user?.id ?? null}
        locale={locale}
        currentUsername={profile?.username ?? null}
      />
    </div>
  );
}
