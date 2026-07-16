-- ─────────────────────────────────────────────────────────────────────────
-- Age verification + NSFW (age-restricted) content.
--
--  • profiles.birth_date — write-once. Settable at registration (insert) or
--    once via set_birth_date() for legacy accounts; never changeable after.
--    Adult = 18+. Under-18 (or no birth_date) → no NSFW access, enforced in the
--    UI from the birth_date the client already receives.
--  • posts.is_nsfw / server_channels.is_nsfw / servers.is_nsfw — "sensitive /
--    age-restricted" flags, Twitter-style. All the RPCs that surface these rows
--    are re-declared to return the new column.
-- ─────────────────────────────────────────────────────────────────────────

-- ── profiles.birth_date (write-once) ───────────────────────────────────────
alter table public.profiles add column if not exists birth_date date;

-- Pin birth_date on self-update (like is_verified / is_premium): it may be set
-- at INSERT (registration) but a normal UPDATE can never change it. Legacy
-- users set it exactly once via set_birth_date() (SECURITY DEFINER, below).
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_verified = (select is_verified from public.profiles where id = auth.uid())
    and is_premium  = (select is_premium  from public.profiles where id = auth.uid())
    and birth_date  is not distinct from (select birth_date from public.profiles where id = auth.uid())
  );

-- Set birth_date exactly once. Refuses when already set or the date is
-- implausible. 13+ minimum to hold an account (adult gating is 18+).
create or replace function public.set_birth_date(p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if p_date is null then raise exception 'invalid date'; end if;
  if p_date > current_date or p_date < current_date - interval '120 years' then
    raise exception 'invalid date';
  end if;
  if age(p_date) < interval '13 years' then raise exception 'too young'; end if;
  if exists (select 1 from public.profiles where id = me and birth_date is not null) then
    raise exception 'already set';
  end if;
  update public.profiles set birth_date = p_date where id = me and birth_date is null;
end;
$$;
grant execute on function public.set_birth_date(date) to authenticated;

-- True when a birth date is present and 18+. Used by server-side gating.
create or replace function public.is_adult(p_birth date)
returns boolean language sql stable as $$
  select p_birth is not null and age(p_birth) >= interval '18 years';
$$;

-- ── NSFW columns ────────────────────────────────────────────────────────────
alter table public.posts           add column if not exists is_nsfw boolean not null default false;
alter table public.server_channels add column if not exists is_nsfw boolean not null default false;
alter table public.servers         add column if not exists is_nsfw boolean not null default false;

-- ── Posts RPCs (+ is_nsfw) — re-declared from 20260621000093 ────────────────
drop function if exists public.get_feed_posts(uuid, integer);
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
  order by b.feed_at desc
  limit lim;
$$;
grant execute on function public.get_feed_posts(uuid, integer) to authenticated, anon;

drop function if exists public.get_user_posts(text, uuid);
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
  order by b.feed_at desc;
$$;
grant execute on function public.get_user_posts(text, uuid) to authenticated, anon;

drop function if exists public.get_user_liked_posts(text, uuid);
create or replace function public.get_user_liked_posts(uname text, viewer uuid)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_nsfw boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with target as (select id from public.profiles where username = uname)
  select
    p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_nsfw,
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

drop function if exists public.get_single_post(uuid, uuid);
create or replace function public.get_single_post(post_id uuid, viewer uuid)
returns table(
  id uuid, content text, image_url text, attachments jsonb, created_at timestamptz, is_nsfw boolean,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean,
  like_count int, comment_count int, repost_count int, liked boolean, reposted boolean,
  reposter_username text, reposter_display_name text, feed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.content, p.image_url, p.attachments, p.created_at, p.is_nsfw,
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

-- ── Channels (+ is_nsfw) ────────────────────────────────────────────────────
-- update_channel: extend with an optional NSFW toggle (name stays optional too).
drop function if exists public.update_channel(uuid, text);
create or replace function public.update_channel(p_channel uuid, p_name text default null, p_is_nsfw boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1) then raise exception 'forbidden'; end if;
  if p_name is not null and char_length(trim(coalesce(p_name, ''))) not between 1 and 20 then
    raise exception 'invalid name';
  end if;
  update public.server_channels set
    name    = case when p_name is not null then trim(p_name) else name end,
    is_nsfw = coalesce(p_is_nsfw, is_nsfw)
  where id = p_channel;
end;
$$;
grant execute on function public.update_channel(uuid, text, boolean) to authenticated;

-- get_server_channels (+ is_nsfw) — re-declared from 20260621000084.
drop function if exists public.get_server_channels(uuid);
create or replace function public.get_server_channels(p_server uuid)
returns table(channel_id uuid, channel_public_id text, name text, type text,
  category_id uuid, category_name text, pos int, category_pos int,
  theme_image text, theme_dim real, theme_x real, theme_y real,
  synced_to_category boolean, my_channel_permissions bigint, is_nsfw boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.public_id::text, c.name, c.type,
    c.category_id, cat.name, c.position, coalesce(cat.position, 0),
    case when c.theme_image is not null then c.theme_image else s.theme_image end,
    case when c.theme_image is not null then c.theme_dim   else s.theme_dim   end,
    case when c.theme_image is not null then c.theme_x     else s.theme_x     end,
    case when c.theme_image is not null then c.theme_y     else s.theme_y     end,
    not exists (
      select 1 from public.channel_role_overrides ro where ro.channel_id = c.id
    ),
    public.channel_perms(c.id, auth.uid()),
    c.is_nsfw
  from public.server_channels c
  join public.servers s on s.id = c.server_id
  left join public.server_categories cat on cat.id = c.category_id
  where c.server_id = p_server and public.is_server_member(p_server)
  order by coalesce(cat.position, 0) asc, c.position asc, c.created_at asc;
$$;
grant execute on function public.get_server_channels(uuid) to authenticated;

-- ── Servers (+ is_nsfw) ─────────────────────────────────────────────────────
-- update_server: extend with an optional NSFW toggle — re-declared from 20260621000066.
drop function if exists public.update_server(uuid, text, text, text, text, text[], boolean);
create or replace function public.update_server(
  p_server uuid, p_name text default null, p_icon text default null, p_banner text default null,
  p_description text default null, p_tags text[] default null, p_is_public boolean default null,
  p_is_nsfw boolean default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 4) then raise exception 'forbidden'; end if;
  update public.servers set
    name        = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
    icon_url    = case when p_icon   = '' then null when p_icon   is not null then p_icon   else icon_url end,
    banner_url  = case when p_banner = '' then null when p_banner is not null then p_banner else banner_url end,
    description = case when p_description = '' then null when p_description is not null then left(p_description, 300) else description end,
    tags        = coalesce(p_tags, tags),
    is_public   = coalesce(p_is_public, is_public),
    is_nsfw     = coalesce(p_is_nsfw, is_nsfw)
  where id = p_server;
end;
$$;
grant execute on function public.update_server(uuid, text, text, text, text, text[], boolean, boolean) to authenticated;

-- get_server (+ is_nsfw) — re-declared from 20260621000099.
drop function if exists public.get_server(text);
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, vanity text, description text, tags text[], is_public boolean,
  owner_id uuid, is_owner boolean, member_count int, my_permissions bigint,
  my_timeout_until timestamptz, my_timeout_reason text, is_nsfw boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified, s.vanity,
    s.description, s.tags, s.is_public, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id),
    public.server_perms(s.id, auth.uid()),
    (select sm.timeout_until  from public.server_members sm where sm.server_id = s.id and sm.profile_id = auth.uid()),
    (select sm.timeout_reason from public.server_members sm where sm.server_id = s.id and sm.profile_id = auth.uid()),
    s.is_nsfw
  from public.servers s
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;
grant execute on function public.get_server(text) to authenticated;

notify pgrst, 'reload schema';
