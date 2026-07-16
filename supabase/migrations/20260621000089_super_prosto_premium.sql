-- ─────────────────────────────────────────────────────────────────────────
-- "Super Prosto" premium subscription flag on profiles + plumbing so the
-- premium badge / aurora name effect can render everywhere the verified badge
-- does. Granted manually (like is_verified) — no self-service yet.
--
-- ── How to grant / revoke Super Prosto ────────────────────────────────────
--   update public.profiles set is_premium = true  where username = 'tofuyu';
--   update public.profiles set is_premium = true  where public_id = 1518973979718501078;
--   update public.profiles set is_premium = false where username = 'tofuyu';
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists is_premium boolean not null default false;

-- Users must not be able to flip is_verified OR is_premium on their own row.
-- Recreate the self-update policy so both stay pinned to their stored value
-- (a service-role / dashboard SQL update bypasses RLS and is the only way in).
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_verified = (select is_verified from public.profiles where id = auth.uid())
    and is_premium  = (select is_premium  from public.profiles where id = auth.uid())
  );

-- ── get_server_members (+ is_premium) — latest def from 20260621000068 ──
drop function if exists public.get_server_members(uuid);
create or replace function public.get_server_members(p_server uuid)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, is_premium boolean, status text, last_seen timestamptz, is_owner boolean,
  role_color text, role_color2 text, role_glow text, role_icon text,
  hoist_role_id uuid, hoist_role_name text, hoist_role_pos int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium,
    p.status, p.last_seen, (s.owner_id = p.id),
    (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.color is not null
       order by r.position desc limit 1),
    (select r.color2 from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.color is not null
       order by r.position desc limit 1),
    (select r.glow from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.glow is not null
       order by r.position desc limit 1),
    (select r.icon_url from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.icon_url is not null
       order by r.position desc limit 1),
    (select r.id from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.hoist
       order by r.position desc limit 1),
    (select r.name from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.hoist
       order by r.position desc limit 1),
    (select r.position from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.hoist
       order by r.position desc limit 1)
  from public.server_members sm
  join public.profiles p on p.id = sm.profile_id
  join public.servers s on s.id = sm.server_id
  where sm.server_id = p_server and public.is_server_member(p_server)
  order by (s.owner_id = p.id) desc, p.username asc;
$$;
grant execute on function public.get_server_members(uuid) to authenticated;

-- ── get_channel_messages (+ sender_is_premium) — latest def from 20260621000083 ──
drop function if exists public.get_channel_messages(uuid);
create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean, sender_is_premium boolean,
  sender_role_color text, sender_role_color2 text, sender_role_glow text, sender_role_icon text)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.sender_id, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium,
    (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.color2 from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.glow from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.glow is not null
       order by r.position desc limit 1),
    (select r.icon_url from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.icon_url is not null
       order by r.position desc limit 1)
  from public.channel_messages m
  join public.profiles p on p.id = m.sender_id
  join public.server_channels sc on sc.id = m.channel_id
  where m.channel_id = p_channel
    and public.is_channel_member(p_channel)
    and (public.channel_perms(p_channel, auth.uid()) & 128) <> 0
  order by m.created_at asc
  limit 200;
$$;
grant execute on function public.get_channel_messages(uuid) to authenticated;

-- ── get_conversation_messages (+ sender_is_premium) — latest def from 20260621000036 ──
drop function if exists public.get_conversation_messages(uuid);
create or replace function public.get_conversation_messages(conv uuid)
returns table(
  id uuid, content text, created_at timestamptz, sender_id uuid, type text, call_seconds int, reply_to uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean, sender_is_premium boolean
)
language sql stable security definer as $$
  select
    m.id, m.content, m.created_at, m.sender_id, m.type, m.call_seconds, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium
  from public.direct_messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = conv
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conv and cp.profile_id = auth.uid()
    )
  order by m.created_at asc
  limit 200;
$$;

-- ── get_conversation_members (+ is_premium) — latest def from 20260621000034 ──
drop function if exists public.get_conversation_members(uuid);
create or replace function public.get_conversation_members(conv uuid)
returns table(
  id uuid, public_id text, username text, display_name text,
  avatar_url text, is_verified boolean, is_moderator boolean, is_premium boolean,
  status text, last_seen timestamptz, is_owner boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.public_id::text, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium,
    p.status, p.last_seen, (c.owner_id = p.id)
  from public.conversation_participants cp
  join public.profiles p      on p.id = cp.profile_id
  join public.conversations c on c.id = cp.conversation_id
  where cp.conversation_id = conv
    and exists (select 1 from public.conversation_participants me where me.conversation_id = conv and me.profile_id = auth.uid())
  order by (c.owner_id = p.id) desc, p.username asc;
$$;

-- ── get_my_conversations (+ other_is_premium) — latest def from 20260621000034 ──
drop function if exists public.get_my_conversations(uuid);
create or replace function public.get_my_conversations(my_id uuid)
returns table(
  conversation_id uuid, is_group boolean, conv_public_id text, group_name text, group_avatar text,
  member_count int, other_id uuid, other_public_id text, other_username text, other_display_name text,
  other_avatar_url text, other_is_verified boolean, other_is_moderator boolean, other_is_premium boolean,
  other_status text, other_last_seen timestamptz, muted boolean, pinned boolean, unread_count int
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.is_group, c.public_id::text, c.name, c.avatar_url,
    (select count(*) from public.conversation_participants cpc where cpc.conversation_id = c.id)::int,
    o.id, o.public_id::text, o.username, o.display_name, o.avatar_url, o.is_verified, o.is_moderator, o.is_premium, o.status, o.last_seen,
    cp.muted, cp.pinned,
    (
      select count(*)
      from public.direct_messages dm
      where dm.conversation_id = c.id
        and dm.sender_id <> my_id
        and coalesce(dm.type, 'text') <> 'system'
        and dm.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz)
    )::int as unread_count
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  left join lateral (
    select p.* from public.conversation_participants cp2
    join public.profiles p on p.id = cp2.profile_id
    where cp2.conversation_id = c.id and cp2.profile_id <> my_id
    limit 1
  ) o on (not c.is_group)
  where cp.profile_id = my_id and cp.hidden = false
  order by
    cp.pinned desc,
    coalesce(
      (select max(dm.created_at) from public.direct_messages dm where dm.conversation_id = c.id),
      c.created_at
    ) desc;
$$;

-- ── Posts: get_feed_posts + get_user_posts (+ author_is_premium) — latest from 20260621000080 ──
drop function if exists public.get_feed_posts(uuid, integer);
create or replace function public.get_feed_posts(viewer uuid, lim int default 60)
returns table(
  id uuid, content text, image_url text, created_at timestamptz, is_edited boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, p.content, p.image_url, p.created_at, p.is_edited, p.view_count,
           p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p
    union all
    select p.id, p.content, p.image_url, p.created_at, p.is_edited, p.view_count,
           p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
  )
  select
    b.id, b.content, b.image_url, b.created_at, b.is_edited,
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

drop function if exists public.get_user_posts(text, uuid);
create or replace function public.get_user_posts(uname text, viewer uuid)
returns table(
  id uuid, content text, image_url text, created_at timestamptz, is_edited boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with target as (select id from public.profiles where username = uname),
  base as (
    select p.id, p.content, p.image_url, p.created_at, p.is_edited, p.view_count,
           p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p where p.author_id = (select id from target)
    union all
    select p.id, p.content, p.image_url, p.created_at, p.is_edited, p.view_count,
           p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
    where r.user_id = (select id from target)
  )
  select
    b.id, b.content, b.image_url, b.created_at, b.is_edited,
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

-- ── get_post_comments (+ author_is_premium) — latest def from 20260621000033 ──
drop function if exists public.get_post_comments(uuid);
create or replace function public.get_post_comments(post uuid)
returns table(
  id uuid, content text, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.content, c.created_at, a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator, a.is_premium
  from public.post_comments c
  join public.profiles a on a.id = c.author_id
  where c.post_id = post
  order by c.created_at asc
  limit 200;
$$;

-- ── get_followers / get_following (+ is_premium) — latest def from 20260621000062 ──
-- Drop first: adding a column changes the return type (create-or-replace alone
-- can't change a function's OUT columns).
drop function if exists public.get_followers(text);
create or replace function public.get_followers(uname text)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, is_premium boolean)
language sql stable security definer set search_path = public as $$
  with target as (select id from public.profiles where username = uname)
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = (select id from target)
  order by p.username asc
  limit 200;
$$;
grant execute on function public.get_followers(text) to authenticated, anon;

drop function if exists public.get_following(text);
create or replace function public.get_following(uname text)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, is_premium boolean)
language sql stable security definer set search_path = public as $$
  with target as (select id from public.profiles where username = uname)
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = (select id from target)
  order by p.username asc
  limit 200;
$$;
grant execute on function public.get_following(text) to authenticated, anon;

-- Refresh PostgREST's schema cache so the recreated RPCs resolve immediately.
notify pgrst, 'reload schema';
