-- ─────────────────────────────────────────────────────────────────────────
-- Feed posts: support multiple attachments of any kind (images, videos, files)
-- instead of a single image.
--
-- `attachments` is a JSONB array of { url, kind, name? } objects, where kind is
-- 'image' | 'video' | 'file' — mirroring the chat ChatAttachment shape so the
-- client reuses the same rendering (ChatAlbum / ChatMedia). The legacy
-- `image_url` column stays for older posts; the client falls back to it when
-- `attachments` is empty.
--
-- All four post-returning RPCs (feed, profile posts, liked posts, single post)
-- are rebuilt to also return `attachments`, so PostCard shows the media
-- everywhere it appears. Each keeps its exact previous row shape; only the new
-- `attachments jsonb` column is inserted right after `image_url`.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.posts
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── Feed: all posts + reposts, newest activity first (latest def from 20260621000089) ──
drop function if exists public.get_feed_posts(uuid, integer);
create or replace function public.get_feed_posts(viewer uuid, lim int default 60)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_edited boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.view_count,
           p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p
    union all
    select p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.view_count,
           p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
  )
  select
    b.id, b.content, b.image_url, b.attachments, b.created_at, b.is_edited,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator, a.is_premium,
    (select count(*) from public.post_likes l    where l.post_id = b.id)::int,
    (select count(*) from public.post_comments c where c.post_id = b.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = b.id)::int,
    b.view_count,
    exists(select 1 from public.post_likes l  where l.post_id = b.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr    where rr.post_id = b.id and rr.user_id = viewer),
    rp.username, rp.display_name, b.feed_at
  from base b
  join public.profiles a on a.id = b.author_id
  left join public.profiles rp on rp.id = b.reposter_id
  order by b.feed_at desc
  limit lim;
$$;
grant execute on function public.get_feed_posts(uuid, integer) to authenticated, anon;

-- ── Profile: a user's own posts + their reposts (latest def from 20260621000089) ──
drop function if exists public.get_user_posts(text, uuid);
create or replace function public.get_user_posts(uname text, viewer uuid)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_edited boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with target as (select id from public.profiles where username = uname),
  base as (
    select p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.view_count,
           p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p where p.author_id = (select id from target)
    union all
    select p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.view_count,
           p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
    where r.user_id = (select id from target)
  )
  select
    b.id, b.content, b.image_url, b.attachments, b.created_at, b.is_edited,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator, a.is_premium,
    (select count(*) from public.post_likes l    where l.post_id = b.id)::int,
    (select count(*) from public.post_comments c where c.post_id = b.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = b.id)::int,
    b.view_count,
    exists(select 1 from public.post_likes l  where l.post_id = b.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr    where rr.post_id = b.id and rr.user_id = viewer),
    rp.username, rp.display_name, b.feed_at
  from base b
  join public.profiles a on a.id = b.author_id
  left join public.profiles rp on rp.id = b.reposter_id
  order by b.feed_at desc;
$$;
grant execute on function public.get_user_posts(text, uuid) to authenticated, anon;

-- ── Profile: posts a user has liked (latest def from 20260621000062) ──
drop function if exists public.get_user_liked_posts(text, uuid);
create or replace function public.get_user_liked_posts(uname text, viewer uuid)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with target as (select id from public.profiles where username = uname)
  select
    p.id, p.content, p.image_url, p.attachments, p.created_at,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator,
    (select count(*) from public.post_likes l    where l.post_id = p.id)::int,
    (select count(*) from public.post_comments c where c.post_id = p.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = p.id)::int,
    exists(select 1 from public.post_likes l where l.post_id = p.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr where rr.post_id = p.id and rr.user_id = viewer),
    null::text, null::text, pl.created_at
  from public.post_likes pl
  join public.posts p    on p.id = pl.post_id
  join public.profiles a on a.id = p.author_id
  where pl.user_id = (select id from target)
  order by pl.created_at desc
  limit 60;
$$;
grant execute on function public.get_user_liked_posts(text, uuid) to authenticated, anon;

-- ── Single post by id (latest def from 20260621000033) ──
drop function if exists public.get_single_post(uuid, uuid);
create or replace function public.get_single_post(post_id uuid, viewer uuid)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.content, p.image_url, p.attachments, p.created_at,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator,
    (select count(*) from public.post_likes l    where l.post_id = p.id)::int,
    (select count(*) from public.post_comments c where c.post_id = p.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = p.id)::int,
    exists(select 1 from public.post_likes l where l.post_id = p.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr where rr.post_id = p.id and rr.user_id = viewer),
    null::text, null::text, p.created_at
  from public.posts p
  join public.profiles a on a.id = p.author_id
  where p.id = post_id;
$$;
grant execute on function public.get_single_post(uuid, uuid) to authenticated, anon;
