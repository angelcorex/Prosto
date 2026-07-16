'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import Link from 'next/link';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { VerifiedBadge, ModeratorBadge, renderEmojiNodes } from '@/components/ui';
import { PostCard, mapFeedRow } from '@/features/posts';
import type { Post } from '@/features/posts';

interface Person {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_moderator?: boolean;
  bio: string | null;
}

interface SearchResults {
  people: Person[];
  posts: Post[];
}

interface TrendingTag {
  tag: string;
  post_count: number;
}

type Tab = 'all' | 'people' | 'posts';

interface Labels {
  placeholder: string;
  people: string;
  posts: string;
  all: string;
  noResults: string;
  typeToSearch: string;
  followLabel: string;
  trendingTitle: string;
  postsWord: string;
}

/** Compact count, e.g. 41800 → "41.8K". */
function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function SearchShell({ locale, labels, initialQuery = '' }: { locale: string; labels: Labels; initialQuery?: string }) {
  const [query,   setQuery]   = useState(initialQuery);
  const [tab,     setTab]     = useState<Tab>('all');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<TrendingTag[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sbRef = useRef(createClient());

  // Load trending hashtags once (shown on the empty "trending" screen).
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('trending_hashtags', { lim: 20 }).then(({ data }: { data: TrendingTag[] | null }) => {
      setTrending(Array.isArray(data) ? data : []);
    });
  }, []);

  const doSearch = useCallback(async (q: string, t: Tab) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults(null); return; }

    // Hashtag query → posts carrying that tag.
    if (trimmed.startsWith('#')) {
      const tag = trimmed.replace(/^#+/, '').toLowerCase();
      if (!tag) { setResults(null); return; }
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sbRef.current as any).rpc('get_hashtag_posts', { p_tag: tag, viewer: null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setResults({ people: [], posts: (Array.isArray(data) ? data : []).map((r: any) => mapFeedRow(r)) });
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&type=${t}`,
        { signal: ctrl.signal },
      );
      const data = await res.json() as SearchResults;
      setResults(data);
    } catch {
      // aborted
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query, tab), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, tab, doSearch]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all',    label: labels.all },
    { key: 'people', label: labels.people },
    { key: 'posts',  label: labels.posts },
  ];

  const showPeople = (tab === 'all' || tab === 'people') && (results?.people ?? []).length > 0;
  const showPosts  = (tab === 'all' || tab === 'posts')  && (results?.posts  ?? []).length > 0;
  const isEmpty    = results && !showPeople && !showPosts;

  return (
    <div className="flex min-h-full flex-col">

      {/* ── Search bar ── */}
      <div className="sticky top-0 z-sticky border-b border-border/30 bg-background/90 px-4 py-3 backdrop-blur-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={labels.placeholder}
            className={cn(
              'w-full rounded-xl bg-accent/50 py-2.5 pl-10 pr-10 text-[15px]',
              'text-foreground placeholder:text-muted-foreground/60',
              'outline-none transition-colors focus:bg-accent',
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Tabs — only shown when there's a query */}
        {query && (
          <div className="mt-1 flex">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex-1 py-3 text-sm font-medium transition-colors duration-fast border-b-2',
                  tab === t.key
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <div className="flex-1 px-4 pt-4 md:pb-10">

        {/* Empty state → Trending hashtags (Twitter-style) */}
        {!query && (
          trending.length > 0 ? (
            <div>
              <h2 className="mb-3 px-1 text-[17px] font-bold tracking-tight">{labels.trendingTitle}</h2>
              <div className="flex flex-col gap-2">
                {trending.map((tg, i) => (
                  <button
                    key={tg.tag}
                    type="button"
                    onClick={() => setQuery(`#${tg.tag}`)}
                    className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <span className="w-5 shrink-0 text-center text-[14px] font-semibold tabular-nums text-muted-foreground/50">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-link">#{tg.tag}</span>
                      <span className="block text-[13px] text-muted-foreground">{formatCount(tg.post_count)} {labels.postsWord}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-20 text-center text-[15px] text-muted-foreground">{labels.typeToSearch}</p>
          )
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-link border-t-transparent" />
          </div>
        )}

        {!loading && isEmpty && (
          <p className="py-16 text-center text-[15px] text-muted-foreground">{labels.noResults}</p>
        )}

        {/* People */}
        {!loading && showPeople && (
          <section className="mb-6">
            {tab === 'all' && (
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {labels.people}
              </h2>
            )}
            <div className="flex flex-col gap-1">
              {results!.people.map(person => (
                <PersonRow key={person.username} person={person} />
              ))}
            </div>
          </section>
        )}

        {/* Posts */}
        {!loading && showPosts && (
          <section>
            {tab === 'all' && (
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {labels.posts}
              </h2>
            )}
            {results!.posts.map(post => (
              <PostCard key={post.id} post={post} locale={locale} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

/* ── Person row ── */
function PersonRow({ person }: { person: Person }) {
  const initial     = (person.display_name ?? person.username)[0]?.toUpperCase() ?? '?';
  const displayName = person.display_name ?? person.username;

  return (
    <Link
      href={`/u/${person.username}`}
      className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors duration-fast hover:bg-accent/50"
    >
      {/* Avatar */}
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-link/20">
        {person.avatar_url ? (
          <AvatarImage src={person.avatar_url} alt={displayName} sizes="44px" className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-bold text-link">
            {initial}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{renderEmojiNodes(displayName)}</span>
          {person.is_verified && <VerifiedBadge size="sm" />}
          {person.is_moderator && <ModeratorBadge size="sm" />}
        </div>
        <p className="truncate text-sm text-muted-foreground">@{person.username}</p>
        {person.bio && (
          <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground/70">{person.bio}</p>
        )}
      </div>
    </Link>
  );
}
