-- ─────────────────────────────────────────────────────────────────────────
-- Post image attachments + like/comment/repost notifications (deduped).
-- ─────────────────────────────────────────────────────────────────────────

-- Optional image/GIF attachment on a post (text can accompany it).
alter table public.posts add column if not exists image_url text;

-- Allow the new notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('follow','friend_request','friend_accepted','message','mention','like','comment','repost'));

-- Insert a notification only once per (recipient, actor, type, ref). Never
-- notify yourself. Re-doing the action (like/unlike/relike, refollow) does NOT
-- create a second notification.
create or replace function public.notify_once(p_user uuid, p_type text, p_actor uuid, p_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_actor is null or p_user = p_actor then return; end if;
  if exists (
    select 1 from public.notifications
    where user_id = p_user and actor_id = p_actor and type = p_type
      and (ref_id is not distinct from p_ref)
  ) then return; end if;
  insert into public.notifications (user_id, type, actor_id, ref_id)
  values (p_user, p_type, p_actor, p_ref);
end;
$$;

-- ── Re-assert feed/profile/single-post RPCs to include image_url ──
drop function if exists public.get_feed_posts(uuid, integer);
create or replace function public.get_feed_posts(viewer uuid, lim int default 60)
returns table(
  id uuid, content text, image_url text, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text, author_is_verified boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with base as (
    select p.id, p.content, p.image_url, p.created_at, p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p
    union all
    select p.id, p.content, p.image_url, p.created_at, p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
  )
  select
    b.id, b.content, b.image_url, b.created_at,
    a.username, a.display_name, a.avatar_url, a.is_verified,
    (select count(*) from public.post_likes l    where l.post_id = b.id)::int,
    (select count(*) from public.post_comments c where c.post_id = b.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = b.id)::int,
    exists(select 1 from public.post_likes l where l.post_id = b.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr where rr.post_id = b.id and rr.user_id = viewer),
    rp.username, rp.display_name, b.feed_at
  from base b
  join public.profiles a on a.id = b.author_id
  left join public.profiles rp on rp.id = b.reposter_id
  order by b.feed_at desc
  limit lim;
$$;

drop function if exists public.get_user_posts(text, uuid);
create or replace function public.get_user_posts(uname text, viewer uuid)
returns table(
  id uuid, content text, image_url text, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text, author_is_verified boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with target as (select id from public.profiles where username = uname),
  base as (
    select p.id, p.content, p.image_url, p.created_at, p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p where p.author_id = (select id from target)
    union all
    select p.id, p.content, p.image_url, p.created_at, p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
    where r.user_id = (select id from target)
  )
  select
    b.id, b.content, b.image_url, b.created_at,
    a.username, a.display_name, a.avatar_url, a.is_verified,
    (select count(*) from public.post_likes l    where l.post_id = b.id)::int,
    (select count(*) from public.post_comments c where c.post_id = b.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = b.id)::int,
    exists(select 1 from public.post_likes l where l.post_id = b.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr where rr.post_id = b.id and rr.user_id = viewer),
    rp.username, rp.display_name, b.feed_at
  from base b
  join public.profiles a on a.id = b.author_id
  left join public.profiles rp on rp.id = b.reposter_id
  order by b.feed_at desc
  limit 60;
$$;

-- Single post by id (for the notification → post link).
drop function if exists public.get_single_post(uuid, uuid);
create or replace function public.get_single_post(post_id uuid, viewer uuid)
returns table(
  id uuid, content text, image_url text, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text, author_is_verified boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.content, p.image_url, p.created_at,
    a.username, a.display_name, a.avatar_url, a.is_verified,
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
