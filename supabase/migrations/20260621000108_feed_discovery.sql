-- ─────────────────────────────────────────────────────────────────────────
-- Feed discovery tabs: Following, Trending, Top and Gallery.
--
-- Every function returns the SAME column set as get_feed_posts so the client
-- mapper (mapFeedRow) is reused as-is. NSFW posts are returned with is_nsfw so
-- the client blurs/gates them (consistent with the main feed). These are pure
-- reads (security definer, scoped by the passed viewer for liked/reposted).
-- ─────────────────────────────────────────────────────────────────────────

-- Posts from the people the viewer follows (most recent first).
drop function if exists public.get_following_posts(uuid, integer);
create or replace function public.get_following_posts(viewer uuid, lim int default 60)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_edited boolean, is_nsfw boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.is_nsfw,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator, a.is_premium,
    (select count(*) from public.post_likes l    where l.post_id = p.id)::int,
    (select count(*) from public.post_comments c where c.post_id = p.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = p.id)::int,
    p.view_count,
    exists(select 1 from public.post_likes l  where l.post_id = p.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr    where rr.post_id = p.id and rr.user_id = viewer),
    null::text, null::text, p.created_at
  from public.posts p
  join public.profiles a on a.id = p.author_id
  where p.author_id in (select f.following_id from public.follows f where f.follower_id = viewer)
  order by p.created_at desc
  limit lim;
$$;
grant execute on function public.get_following_posts(uuid, integer) to authenticated;

-- Trending: recent posts (last 7 days) ranked by a weighted engagement score.
drop function if exists public.get_trending_posts(uuid, integer);
create or replace function public.get_trending_posts(viewer uuid, lim int default 60)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_edited boolean, is_nsfw boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with agg as (
    select p.id,
      (select count(*) from public.post_likes l    where l.post_id = p.id)::int as lk,
      (select count(*) from public.post_comments c where c.post_id = p.id)::int as cm,
      (select count(*) from public.reposts rr      where rr.post_id = p.id)::int as rp
    from public.posts p
    where p.created_at > now() - interval '7 days'
  )
  select
    p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.is_nsfw,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator, a.is_premium,
    g.lk, g.cm, g.rp, p.view_count,
    exists(select 1 from public.post_likes l  where l.post_id = p.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr    where rr.post_id = p.id and rr.user_id = viewer),
    null::text, null::text, p.created_at
  from public.posts p
  join agg g on g.id = p.id
  join public.profiles a on a.id = p.author_id
  order by (g.lk * 3 + g.cm * 2 + g.rp * 4 + coalesce(p.view_count, 0) * 0.25) desc, p.created_at desc
  limit lim;
$$;
grant execute on function public.get_trending_posts(uuid, integer) to authenticated, anon;

-- Top: the most-liked posts of the last 30 days.
drop function if exists public.get_top_posts(uuid, integer);
create or replace function public.get_top_posts(viewer uuid, lim int default 60)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_edited boolean, is_nsfw boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with agg as (
    select p.id,
      (select count(*) from public.post_likes l    where l.post_id = p.id)::int as lk,
      (select count(*) from public.post_comments c where c.post_id = p.id)::int as cm,
      (select count(*) from public.reposts rr      where rr.post_id = p.id)::int as rp
    from public.posts p
    where p.created_at > now() - interval '30 days'
  )
  select
    p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.is_nsfw,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator, a.is_premium,
    g.lk, g.cm, g.rp, p.view_count,
    exists(select 1 from public.post_likes l  where l.post_id = p.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr    where rr.post_id = p.id and rr.user_id = viewer),
    null::text, null::text, p.created_at
  from public.posts p
  join agg g on g.id = p.id
  join public.profiles a on a.id = p.author_id
  order by g.lk desc, g.cm desc, p.created_at desc
  limit lim;
$$;
grant execute on function public.get_top_posts(uuid, integer) to authenticated, anon;

-- Gallery: recent posts that actually contain media (image/video attachments
-- or the legacy image_url), newest first — the visual grid.
drop function if exists public.get_gallery_posts(uuid, integer);
create or replace function public.get_gallery_posts(viewer uuid, lim int default 90)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_edited boolean, is_nsfw boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.is_nsfw,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator, a.is_premium,
    (select count(*) from public.post_likes l    where l.post_id = p.id)::int,
    (select count(*) from public.post_comments c where c.post_id = p.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = p.id)::int,
    p.view_count,
    exists(select 1 from public.post_likes l  where l.post_id = p.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr    where rr.post_id = p.id and rr.user_id = viewer),
    null::text, null::text, p.created_at
  from public.posts p
  join public.profiles a on a.id = p.author_id
  where (jsonb_typeof(p.attachments) = 'array' and jsonb_array_length(p.attachments) > 0)
     or p.image_url is not null
  order by p.created_at desc
  limit lim;
$$;
grant execute on function public.get_gallery_posts(uuid, integer) to authenticated, anon;

notify pgrst, 'reload schema';
