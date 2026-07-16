-- ─────────────────────────────────────────────────────────────────────────
-- Hashtags for feed posts: a normalized post→tag table kept in sync by a
-- trigger, plus RPCs for trending tags, tag search and compose suggestions.
-- Tags are #-prefixed runs of letters (Latin + Cyrillic), digits and "_".
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag     text not null,
  primary key (post_id, tag)
);
create index if not exists post_hashtags_tag_idx on public.post_hashtags (tag);

alter table public.post_hashtags enable row level security;
drop policy if exists "hashtags readable" on public.post_hashtags;
create policy "hashtags readable" on public.post_hashtags for select using (true);

-- Extract distinct lowercase tags from a post's content into post_hashtags.
create or replace function public.sync_post_hashtags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.post_hashtags where post_id = new.id;
  insert into public.post_hashtags (post_id, tag)
  select distinct new.id, lower(m[1])
  from regexp_matches(coalesce(new.content, ''), '#([0-9A-Za-zА-Яа-яЁё_]{1,50})', 'g') as m;
  return new;
end;
$$;

drop trigger if exists trg_sync_post_hashtags on public.posts;
create trigger trg_sync_post_hashtags
  after insert or update of content on public.posts
  for each row execute function public.sync_post_hashtags();

-- Backfill existing posts once.
insert into public.post_hashtags (post_id, tag)
select distinct p.id, lower(m[1])
from public.posts p,
     regexp_matches(coalesce(p.content, ''), '#([0-9A-Za-zА-Яа-яЁё_]{1,50})', 'g') as m
on conflict do nothing;

-- Most-used tags (the search "Trending" panel).
create or replace function public.trending_hashtags(lim int default 20)
returns table(tag text, post_count int)
language sql stable security definer set search_path = public as $$
  select tag, count(distinct post_id)::int as post_count
  from public.post_hashtags
  group by tag
  order by post_count desc, tag asc
  limit greatest(1, least(coalesce(lim, 20), 50));
$$;
grant execute on function public.trending_hashtags(int) to authenticated, anon;

-- Tag suggestions for the composer (prefix match, popularity-ordered).
create or replace function public.suggest_hashtags(p_prefix text, lim int default 6)
returns table(tag text, post_count int)
language sql stable security definer set search_path = public as $$
  select tag, count(distinct post_id)::int as post_count
  from public.post_hashtags
  where p_prefix is null or p_prefix = '' or tag like lower(p_prefix) || '%'
  group by tag
  order by post_count desc, tag asc
  limit greatest(1, least(coalesce(lim, 6), 12));
$$;
grant execute on function public.suggest_hashtags(text, int) to authenticated, anon;

-- Posts carrying a given tag. Same row shape as get_user_posts so the client
-- reuses mapFeedRow + PostCard unchanged.
create or replace function public.get_hashtag_posts(p_tag text, viewer uuid)
returns table(
  id uuid, content text, image_url text, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.content, p.image_url, p.created_at,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator,
    (select count(*) from public.post_likes l    where l.post_id = p.id)::int,
    (select count(*) from public.post_comments c where c.post_id = p.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = p.id)::int,
    exists(select 1 from public.post_likes l where l.post_id = p.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr where rr.post_id = p.id and rr.user_id = viewer),
    null::text, null::text, p.created_at
  from public.post_hashtags h
  join public.posts p    on p.id = h.post_id
  join public.profiles a on a.id = p.author_id
  where h.tag = lower(trim(p_tag))
  order by p.created_at desc
  limit 60;
$$;
grant execute on function public.get_hashtag_posts(text, uuid) to authenticated, anon;
