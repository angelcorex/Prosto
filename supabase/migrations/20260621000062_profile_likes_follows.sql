-- ─────────────────────────────────────────────────────────────────────────
-- Profile extras: a user's liked posts (for the Likes tab) and the
-- follower / following lists (for the clickable stats on the profile).
-- ─────────────────────────────────────────────────────────────────────────

-- Posts a user has liked, newest like first. Same row shape as get_user_posts
-- so the client can reuse mapFeedRow + PostCard unchanged.
create or replace function public.get_user_liked_posts(uname text, viewer uuid)
returns table(
  id uuid, content text, image_url text, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with target as (select id from public.profiles where username = uname)
  select
    p.id, p.content, p.image_url, p.created_at,
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

-- People who follow `uname`.
create or replace function public.get_followers(uname text)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean)
language sql stable security definer set search_path = public
as $$
  with target as (select id from public.profiles where username = uname)
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = (select id from target)
  order by p.username asc
  limit 200;
$$;
grant execute on function public.get_followers(text) to authenticated, anon;

-- People `uname` follows.
create or replace function public.get_following(uname text)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean)
language sql stable security definer set search_path = public
as $$
  with target as (select id from public.profiles where username = uname)
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = (select id from target)
  order by p.username asc
  limit 200;
$$;
grant execute on function public.get_following(text) to authenticated, anon;
