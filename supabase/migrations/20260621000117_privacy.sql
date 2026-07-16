-- ─────────────────────────────────────────────────────────────────────────
-- Privacy settings + block enforcement.
--
-- Per-profile privacy levels (Discord/Telegram-style), each 'everyone' |
-- 'friends' | 'nobody':
--   privacy_profile     — who can view my full profile + posts
--   privacy_messages    — who can DM me
--   privacy_friend_req  — who can send me a friend request
-- Blocks are always enforced regardless of level.
--
-- Defaults are 'everyone' so existing behaviour is unchanged until a user opts
-- into stricter settings.
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'privacy_level') then
    create type public.privacy_level as enum ('everyone', 'friends', 'nobody');
  end if;
end $$;

alter table public.profiles
  add column if not exists privacy_profile    public.privacy_level not null default 'everyone',
  add column if not exists privacy_messages   public.privacy_level not null default 'everyone',
  add column if not exists privacy_friend_req public.privacy_level not null default 'everyone';

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Accepted-friends check (either direction).
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.from_id = a and fr.to_id = b) or (fr.from_id = b and fr.to_id = a))
  );
$$;

-- Generic gate: can `viewer` reach `target` at the given privacy level?
-- Blocks (either direction) always fail. Self always passes.
create or replace function public.passes_privacy(viewer uuid, target uuid, lvl public.privacy_level)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when viewer is null then lvl = 'everyone'          -- anonymous: only public
    when viewer = target then true                     -- always see/reach self
    when exists (select 1 from public.blocks b
                 where (b.blocker_id = viewer and b.blocked_id = target)
                    or (b.blocker_id = target and b.blocked_id = viewer)) then false
    when lvl = 'everyone' then true
    when lvl = 'friends'  then public.are_friends(viewer, target)
    else false                                         -- 'nobody'
  end;
$$;

-- Can the current user view `target`'s profile + posts?
create or replace function public.can_view_profile(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.passes_privacy(auth.uid(), target,
    (select privacy_profile from public.profiles where id = target));
$$;
grant execute on function public.can_view_profile(uuid) to authenticated, anon;

-- ── send_friend_request: honour the target's privacy_friend_req ─────────────
-- Re-assert (latest from 20260621000037) + a privacy gate right after the block
-- check. 'nobody' → nobody can add; 'friends' → only mutuals (rare but valid).
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null or target is null or me = target then return 'noop'; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = me and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = me)
  ) then raise exception 'blocked'; end if;

  -- Privacy: can I send THIS user a friend request?
  if not public.passes_privacy(me, target,
      (select privacy_friend_req from public.profiles where id = target)) then
    raise exception 'not_allowed';
  end if;

  -- Already friends (either direction) → nothing to do.
  if exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.from_id = me and fr.to_id = target) or (fr.from_id = target and fr.to_id = me))
  ) then return 'already'; end if;

  -- Idempotent upsert of a pending request from me → target.
  insert into public.friend_requests (from_id, to_id, status)
  values (me, target, 'pending')
  on conflict (from_id, to_id) do update set status = 'pending'
  where public.friend_requests.status <> 'accepted';

  insert into public.notifications (user_id, type, actor_id, ref_id)
  values (target, 'friend_request', me, me)
  on conflict do nothing;

  return 'sent';
end;
$$;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- ── DM message gate: honour the recipient's privacy_messages (1:1 only) ─────
-- A small SECURITY DEFINER guard called from send_dm; keeps send_dm otherwise
-- unchanged. Returns true when `me` may message the OTHER 1:1 participant.
create or replace function public.can_message_conversation(conv uuid, me uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when (select coalesce(is_group, false) from public.conversations where id = conv) then true
    else coalesce((
      select public.passes_privacy(me, other.profile_id,
        (select privacy_messages from public.profiles where id = other.profile_id))
      from public.conversation_participants other
      where other.conversation_id = conv and other.profile_id <> me
      limit 1
    ), true)
  end;
$$;
grant execute on function public.can_message_conversation(uuid, uuid) to authenticated;

-- ── send_dm: add the privacy gate (re-assert latest from 20260621000090) ────
create or replace function public.send_dm(conv_id uuid, body text, reply uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  new_id uuid;
  new_at timestamptz;
  is_grp boolean := false;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  perform public.check_rate_limit('message', 15, 10);

  if not exists (select 1 from public.conversation_participants where conversation_id = conv_id and profile_id = me) then
    raise exception 'not a participant';
  end if;

  select coalesce(c.is_group, false) into is_grp from public.conversations c where c.id = conv_id;

  if not is_grp and exists (
    select 1
    from public.conversation_participants cp
    join public.blocks b
      on (b.blocker_id = me and b.blocked_id = cp.profile_id)
      or (b.blocker_id = cp.profile_id and b.blocked_id = me)
    where cp.conversation_id = conv_id and cp.profile_id <> me
  ) then
    raise exception 'blocked';
  end if;

  -- Privacy: the recipient may restrict who can DM them (1:1 only).
  if not public.can_message_conversation(conv_id, me) then
    raise exception 'not_allowed';
  end if;

  body := trim(body);
  if body = '' or char_length(body) > public.message_char_limit(me) then raise exception 'invalid content'; end if;

  insert into public.direct_messages (conversation_id, sender_id, content, reply_to)
  values (conv_id, me, body, reply)
  returning direct_messages.id, direct_messages.created_at into new_id, new_at;

  update public.conversation_participants set hidden = false where conversation_id = conv_id;

  insert into public.notifications (user_id, type, actor_id, ref_id)
  select profile_id, 'message', me, conv_id
  from public.conversation_participants
  where conversation_id = conv_id and profile_id <> me;

  if body ~* '@everyone([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select profile_id, 'mention', me, conv_id
    from public.conversation_participants
    where conversation_id = conv_id and profile_id <> me;
  elsif body ~* '@here([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select cp.profile_id, 'mention', me, conv_id
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.profile_id
    where cp.conversation_id = conv_id and cp.profile_id <> me
      and p.last_seen is not null and p.last_seen > now() - interval '2 minutes';
  else
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select cp.profile_id, 'mention', me, conv_id
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.profile_id
    where cp.conversation_id = conv_id and cp.profile_id <> me
      and lower(body) ~ ('@' || lower(p.username) || '([^a-z0-9_]|$)');
  end if;

  if reply is not null then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select dm.sender_id, 'mention', me, conv_id
    from public.direct_messages dm
    where dm.id = reply and dm.sender_id <> me;
  end if;

  return query select new_id, new_at;
end;
$$;
grant execute on function public.send_dm(uuid, text, uuid) to authenticated;

-- ── get_user_posts: hide the author's posts from blocked / non-permitted viewers ──
-- Re-assert (latest from 20260621000102) gated by can-view: if the viewer is
-- blocked by the author, or the author's privacy_profile excludes them, return
-- zero rows. The profile page separately shows the "you're blocked" screen.
create or replace function public.get_user_posts(uname text, viewer uuid)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_edited boolean, is_nsfw boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with target as (select id from public.profiles where username = uname),
  base as (
    select p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.is_nsfw, p.view_count,
           p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p where p.author_id = (select id from target)
    union all
    select p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.is_nsfw, p.view_count,
           p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
    where r.user_id = (select id from target)
  )
  select
    b.id, b.content, b.image_url, b.attachments, b.created_at, b.is_edited, b.is_nsfw,
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
  -- Privacy/block gate: viewer must be allowed to see the target's profile.
  where public.passes_privacy(viewer, (select id from target),
    (select privacy_profile from public.profiles where id = (select id from target)))
  order by b.feed_at desc;
$$;
grant execute on function public.get_user_posts(text, uuid) to authenticated, anon;

-- ── get_feed_posts: exclude authors who blocked the viewer ──────────────────
-- The main feed is public, but a user who blocked me must not appear in my
-- feed (and vice-versa). We wrap the existing function's output by filtering
-- out any post whose author has a block relationship with the viewer. Rather
-- than re-assert the whole body, add a block filter via a thin wrapper isn't
-- possible (same name/return); so we re-assert with the block filter added.
-- NOTE: privacy_profile 'friends'/'nobody' authors still appear in the PUBLIC
-- feed by design (feed = discovery); only blocks hard-filter it.
create or replace function public.get_feed_posts(viewer uuid, lim int default 60)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_edited boolean, is_nsfw boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean,
  like_count int, comment_count int, repost_count int, view_count int,
  liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.is_nsfw, p.view_count,
           p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p
    union all
    select p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_edited, p.is_nsfw, p.view_count,
           p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
  )
  select
    b.id, b.content, b.image_url, b.attachments, b.created_at, b.is_edited, b.is_nsfw,
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
  where viewer is null or not exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = viewer and bl.blocked_id = b.author_id)
       or (bl.blocker_id = b.author_id and bl.blocked_id = viewer)
  )
  order by b.feed_at desc
  limit lim;
$$;
grant execute on function public.get_feed_posts(uuid, integer) to authenticated, anon;

notify pgrst, 'reload schema';
