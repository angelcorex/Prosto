-- Post view tracking: simple counter on the post row.
-- Unique-per-user tracking is handled client-side (sessionStorage) to avoid
-- bloating the DB with a per-user views table at MVP scale.

alter table public.posts add column if not exists view_count int not null default 0;
alter table public.posts add column if not exists updated_at timestamptz;

-- Allow authors to update their own posts (content only; guarded by RPC).
drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts"
  on public.posts for update
  using (author_id = auth.uid());

-- Bump view counter (any authenticated user; rate-limited client-side).
create or replace function public.record_post_view(p_post uuid)
returns void language sql security definer set search_path = public as $$
  update public.posts set view_count = view_count + 1 where id = p_post;
$$;
grant execute on function public.record_post_view(uuid) to authenticated;

-- Edit a post (author only; enforces length).
create or replace function public.edit_post(p_post uuid, p_content text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  body text := trim(p_content);
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if char_length(body) < 1 or char_length(body) > 500 then raise exception 'invalid content'; end if;
  if not exists (select 1 from public.posts where id = p_post and author_id = me) then
    raise exception 'forbidden';
  end if;
  update public.posts set content = body, updated_at = now() where id = p_post;
end;
$$;
grant execute on function public.edit_post(uuid, text) to authenticated;

-- Rebuild get_feed_posts to include view_count and updated_at.
drop function if exists public.get_feed_posts(uuid, integer);
create or replace function public.get_feed_posts(viewer uuid, lim int default 60)
returns table(
  id uuid, content text, image_url text, created_at timestamptz, updated_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, p.content, p.image_url, p.created_at, p.updated_at, p.view_count,
           p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p
    union all
    select p.id, p.content, p.image_url, p.created_at, p.updated_at, p.view_count,
           p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
  )
  select
    b.id, b.content, b.image_url, b.created_at, b.updated_at,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator,
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

-- Rebuild get_user_posts with the same additions.
drop function if exists public.get_user_posts(text, uuid);
create or replace function public.get_user_posts(uname text, viewer uuid)
returns table(
  id uuid, content text, image_url text, created_at timestamptz, updated_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with target as (select id from public.profiles where username = uname),
  base as (
    select p.id, p.content, p.image_url, p.created_at, p.updated_at, p.view_count,
           p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p where p.author_id = (select id from target)
    union all
    select p.id, p.content, p.image_url, p.created_at, p.updated_at, p.view_count,
           p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
    where r.user_id = (select id from target)
  )
  select
    b.id, b.content, b.image_url, b.created_at, b.updated_at,
    a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator,
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
