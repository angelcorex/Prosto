'use client';

import { useState, useCallback } from 'react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { createClient } from '@/lib/supabase/client';
import { PostCard, GalleryGrid, mapFeedRow } from '@/features/posts';
import type { Post } from '@/features/posts';

type TabKey = 'forYou' | 'following' | 'trending' | 'top' | 'gallery';

/** Discovery tabs are lazy-loaded on first open via these RPCs. */
const TAB_RPC: Record<Exclude<TabKey, 'forYou'>, string> = {
  following: 'get_following_posts',
  trending:  'get_trending_posts',
  top:       'get_top_posts',
  gallery:   'get_gallery_posts',
};

interface FeedClientProps {
  forYouPosts: Post[];
  viewerId: string | null;
  locale: string;
  currentUsername?: string | null;
}

export function FeedClient({ forYouPosts, viewerId, locale, currentUsername }: FeedClientProps) {
  const t = useT('feed');
  const [active, setActive] = useState<TabKey>('forYou');
  // Only discovery tabs are cached here; "For you" always reads from the server
  // prop so a freshly published post (after router.refresh) shows immediately.
  const [cache, setCache] = useState<Partial<Record<TabKey, Post[]>>>({});
  const [loadingTab, setLoadingTab] = useState<TabKey | null>(null);

  const loadTab = useCallback(async (tab: TabKey) => {
    if (tab === 'forYou' || cache[tab]) return;
    setLoadingTab(tab);
    const sb = createClient();
    const lim = tab === 'gallery' ? 90 : 60;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).rpc(TAB_RPC[tab], { viewer: viewerId ?? null, lim });
    setCache((c) => ({ ...c, [tab]: Array.isArray(data) ? data.map(mapFeedRow) : [] }));
    setLoadingTab((cur) => (cur === tab ? null : cur));
  }, [cache, viewerId]);

  function select(tab: TabKey) {
    setActive(tab);
    void loadTab(tab);
  }

  const tabs: [TabKey, string][] = [
    ['forYou',    t('tabs.forYou')],
    ['following', t('tabs.following')],
    ['trending',  t('tabs.trending')],
    ['top',       t('tabs.top')],
    ['gallery',   t('tabs.gallery')],
  ];

  const emptyLabel =
    active === 'following' ? t('followingEmpty') :
    active === 'trending'  ? t('trendingEmpty')  :
    active === 'top'       ? t('topEmpty')        :
    active === 'gallery'   ? t('galleryEmpty')    :
    t('empty');

  const posts = active === 'forYou' ? forYouPosts : (cache[active] ?? []);
  const isLoading = active !== 'forYou' && loadingTab === active && !cache[active];

  return (
    <>
      {/* Sticky header with pill tabs (scrolls horizontally on narrow screens) */}
      <div className="sticky top-0 z-sticky border-b border-border/20 bg-background/95 backdrop-blur-sm">
        <div className="hide-scrollbar flex items-center gap-1 overflow-x-auto px-4 py-2.5">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => select(key)}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-fast',
                active === key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content — bottom clearance comes from the shell (pb-bottom-nav), so no
          extra padding here or it would stack into a dead gap on mobile. */}
      <div>
        {isLoading ? (
          <p className="py-16 text-center text-[14px] text-muted-foreground">{t('loading')}</p>
        ) : active === 'gallery' ? (
          <GalleryGrid posts={posts} emptyLabel={t('galleryEmpty')} />
        ) : posts.length > 0 ? (
          posts.map((post) => (
            <PostCard
              key={`${post.id}-${post.reposter?.username ?? 'own'}`}
              post={post}
              locale={locale}
              currentUsername={currentUsername}
            />
          ))
        ) : (
          <p className="py-16 text-center text-[14px] text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </>
  );
}
