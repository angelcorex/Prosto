-- ─────────────────────────────────────────────────────────────────────────
-- Server roles & permissions (Discord-style).
--
-- Permission bitmask (bigint):
--   1   MANAGE_CHANNELS
--   2   MANAGE_ROLES
--   4   MANAGE_SERVER
--   8   CREATE_INVITE
--   16  SEND_MESSAGES
--   32  USE_EMOJI        (stickers / GIFs / emoji)
--   64  MANAGE_MESSAGES  (delete others' messages)
--   128 READ_HISTORY
--   256 MENTION_EVERYONE
-- ALL = 511. The owner implicitly has every permission.
-- Each server has a default '@everyone' role applied to all members.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.server_roles (
  id          uuid primary key default gen_random_uuid(),
  server_id   uuid not null references public.servers(id) on delete cascade,
  name        text not null default 'new role' check (char_length(name) between 1 and 40),
  color       text,
  icon_url    text,
  permissions bigint not null default 0,
  position    int not null default 1,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists server_roles_server_idx on public.server_roles (server_id, position);
create unique index if not exists server_roles_one_default on public.server_roles (server_id) where is_default;

create table if not exists public.server_member_roles (
  server_id  uuid not null references public.servers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id    uuid not null references public.server_roles(id) on delete cascade,
  primary key (profile_id, role_id)
);
create index if not exists server_member_roles_role_idx on public.server_member_roles (role_id);

alter table public.server_roles enable row level security;
alter table public.server_member_roles enable row level security;
drop policy if exists "roles: members read" on public.server_roles;
create policy "roles: members read" on public.server_roles for select using (public.is_server_member(server_id));
drop policy if exists "member roles: members read" on public.server_member_roles;
create policy "member roles: members read" on public.server_member_roles for select using (public.is_server_member(server_id));

-- ── Permission helpers ──
-- Effective permission bitmask for a user on a server (owner = all).
create or replace function public.server_perms(p_server uuid, p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.servers where id = p_server and owner_id = p_user) then 511::bigint
    else coalesce((
      select bit_or(r.permissions)
      from public.server_roles r
      where r.server_id = p_server
        and (r.is_default or r.id in (
          select mr.role_id from public.server_member_roles mr where mr.profile_id = p_user
        ))
    ), 0::bigint)
  end;
$$;

-- Does the current user have a permission bit on a server?
create or replace function public.has_perm(p_server uuid, p_bit bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.server_perms(p_server, auth.uid()) & p_bit) <> 0;
$$;
grant execute on function public.server_perms(uuid, uuid) to authenticated;
grant execute on function public.has_perm(uuid, bigint) to authenticated;

-- Ensure a server has its @everyone role (baseline perms).
create or replace function public._ensure_everyone(p_server uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.server_roles (server_id, name, permissions, position, is_default)
  select p_server, '@everyone', 184, 0, true
  where not exists (select 1 from public.server_roles where server_id = p_server and is_default);
end;
$$;

-- Backfill @everyone for existing servers.
do $$ declare s record; begin
  for s in select id from public.servers loop perform public._ensure_everyone(s.id); end loop;
end $$;

-- create_server now also provisions the @everyone role.
drop function if exists public.create_server(text, text);
create or replace function public.create_server(p_name text, p_icon text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; cat uuid; pid text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'invalid name'; end if;

  insert into public.servers (name, icon_url, owner_id)
  values (trim(p_name), p_icon, me) returning id into srv;

  insert into public.server_members (server_id, profile_id) values (srv, me);
  perform public._ensure_everyone(srv);

  insert into public.server_categories (server_id, name, position) values (srv, 'Text Channels', 0) returning id into cat;
  insert into public.server_channels (server_id, category_id, name, position) values (srv, cat, 'general', 0);

  select public_id::text into pid from public.servers where id = srv;
  return pid;
end;
$$;

-- ── Role management RPCs (require MANAGE_ROLES = 2) ──
create or replace function public.get_server_roles(p_server uuid)
returns table(id uuid, name text, color text, icon_url text, permissions bigint, "position" int, is_default boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.color, r.icon_url, r.permissions, r.position, r.is_default
  from public.server_roles r
  where r.server_id = p_server and public.is_server_member(p_server)
  order by r.is_default asc, r.position desc, r.created_at asc;
$$;
grant execute on function public.get_server_roles(uuid) to authenticated;

create or replace function public.create_role(p_server uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.has_perm(p_server, 2) then raise exception 'forbidden'; end if;
  insert into public.server_roles (server_id, name, position)
  values (p_server, coalesce(nullif(trim(p_name),''), 'new role'),
    coalesce((select max(position)+1 from public.server_roles where server_id = p_server), 1))
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.create_role(uuid, text) to authenticated;

create or replace function public.update_role(
  p_role uuid, p_name text default null, p_color text default null,
  p_icon text default null, p_permissions bigint default null
)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid; is_def boolean;
begin
  select server_id, is_default into srv, is_def from public.server_roles where id = p_role;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 2) then raise exception 'forbidden'; end if;
  update public.server_roles set
    -- the default @everyone role keeps its fixed name/appearance; only perms change
    name        = case when is_def then name else coalesce(nullif(trim(coalesce(p_name,'')),''), name) end,
    color       = case when is_def then color else (case when p_color = '' then null when p_color is not null then p_color else color end) end,
    icon_url    = case when is_def then icon_url else (case when p_icon = '' then null when p_icon is not null then p_icon else icon_url end) end,
    permissions = coalesce(p_permissions, permissions)
  where id = p_role;
end;
$$;
grant execute on function public.update_role(uuid, text, text, text, bigint) to authenticated;

create or replace function public.delete_role(p_role uuid)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid; is_def boolean;
begin
  select server_id, is_default into srv, is_def from public.server_roles where id = p_role;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 2) then raise exception 'forbidden'; end if;
  if is_def then raise exception 'cannot delete default role'; end if;
  delete from public.server_roles where id = p_role;
end;
$$;
grant execute on function public.delete_role(uuid) to authenticated;

create or replace function public.set_member_roles(p_server uuid, p_member uuid, p_roles uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 2) then raise exception 'forbidden'; end if;
  delete from public.server_member_roles
    where server_id = p_server and profile_id = p_member
      and role_id not in (select id from public.server_roles where server_id = p_server and is_default);
  insert into public.server_member_roles (server_id, profile_id, role_id)
  select p_server, p_member, r.id
  from public.server_roles r
  where r.server_id = p_server and not r.is_default and r.id = any(p_roles)
  on conflict do nothing;
end;
$$;
grant execute on function public.set_member_roles(uuid, uuid, uuid[]) to authenticated;

create or replace function public.get_member_role_ids(p_server uuid, p_member uuid)
returns table(role_id uuid)
language sql stable security definer set search_path = public as $$
  select mr.role_id from public.server_member_roles mr
  where mr.server_id = p_server and mr.profile_id = p_member and public.is_server_member(p_server);
$$;
grant execute on function public.get_member_role_ids(uuid, uuid) to authenticated;

-- ── get_server now also returns the caller's effective permissions ──
drop function if exists public.get_server(text);
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, vanity text, description text, tags text[], is_public boolean,
  owner_id uuid, is_owner boolean, member_count int, my_permissions bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified, s.vanity,
    s.description, s.tags, s.is_public, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id),
    public.server_perms(s.id, auth.uid())
  from public.servers s
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;
grant execute on function public.get_server(text) to authenticated;

-- ── get_server_members now exposes the member's top role colour + icon ──
drop function if exists public.get_server_members(uuid);
create or replace function public.get_server_members(p_server uuid)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, status text, last_seen timestamptz, is_owner boolean,
  role_color text, role_icon text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator,
    p.status, p.last_seen, (s.owner_id = p.id),
    (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.color is not null
       order by r.position desc limit 1),
    (select r.icon_url from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.icon_url is not null
       order by r.position desc limit 1)
  from public.server_members sm
  join public.profiles p on p.id = sm.profile_id
  join public.servers s on s.id = sm.server_id
  where sm.server_id = p_server and public.is_server_member(p_server)
  order by (s.owner_id = p.id) desc, p.username asc;
$$;
grant execute on function public.get_server_members(uuid) to authenticated;

-- ── Channel / category management → MANAGE_CHANNELS (1) ──
create or replace function public.create_channel(p_server uuid, p_name text, p_category uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if not public.has_perm(p_server, 1) then raise exception 'forbidden'; end if;
  insert into public.server_channels (server_id, category_id, name)
  values (p_server, p_category, trim(p_name)) returning public_id::text into pid;
  return pid;
end;
$$;

create or replace function public.create_category(p_server uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 1) then raise exception 'forbidden'; end if;
  insert into public.server_categories (server_id, name, position)
  values (p_server, trim(p_name),
    coalesce((select max(position)+1 from public.server_categories where server_id = p_server), 1));
end;
$$;

create or replace function public.update_channel(p_channel uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 60 then raise exception 'invalid name'; end if;
  update public.server_channels set name = trim(p_name) where id = p_channel;
end;
$$;

create or replace function public.update_category(p_category uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select cat.server_id into srv from public.server_categories cat where cat.id = p_category;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 60 then raise exception 'invalid name'; end if;
  update public.server_categories set name = trim(p_name) where id = p_category;
end;
$$;

create or replace function public.delete_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1) then raise exception 'forbidden'; end if;
  delete from public.server_channels where id = p_channel;
end;
$$;

create or replace function public.delete_category(p_category uuid)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select cat.server_id into srv from public.server_categories cat where cat.id = p_category;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1) then raise exception 'forbidden'; end if;
  update public.server_channels set category_id = null where category_id = p_category;
  delete from public.server_categories where id = p_category;
end;
$$;

create or replace function public.reorder_channels(p_server uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if not public.has_perm(p_server, 1) then raise exception 'forbidden'; end if;
  for it in select * from jsonb_array_elements(p_items)
  loop
    update public.server_channels
      set category_id = nullif(it->>'category_id','')::uuid,
          position    = coalesce((it->>'position')::int, 0)
    where id = (it->>'id')::uuid and server_id = p_server;
  end loop;
end;
$$;

-- ── Server settings → MANAGE_SERVER (4) ──
drop function if exists public.update_server(uuid, text, text, text, text, text[], boolean);
create or replace function public.update_server(
  p_server uuid, p_name text default null, p_icon text default null, p_banner text default null,
  p_description text default null, p_tags text[] default null, p_is_public boolean default null
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
    is_public   = coalesce(p_is_public, is_public)
  where id = p_server;
end;
$$;
grant execute on function public.update_server(uuid, text, text, text, text, text[], boolean) to authenticated;

create or replace function public.set_server_vanity(p_server uuid, p_vanity text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := lower(trim(coalesce(p_vanity, '')));
begin
  if not public.has_perm(p_server, 4) then raise exception 'forbidden'; end if;
  if v = '' then update public.servers set vanity = null where id = p_server; return; end if;
  if not public._valid_vanity(v) then raise exception 'invalid vanity'; end if;
  if exists (select 1 from public.servers where lower(vanity) = v and id <> p_server) then raise exception 'taken'; end if;
  update public.servers set vanity = v where id = p_server;
end;
$$;

create or replace function public.remove_member(p_server uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 4) then raise exception 'forbidden'; end if;
  if p_member = auth.uid() then raise exception 'cannot remove self'; end if;
  if exists (select 1 from public.servers where id = p_server and owner_id = p_member) then
    raise exception 'cannot remove owner';
  end if;
  delete from public.server_members where server_id = p_server and profile_id = p_member;
end;
$$;

-- ── Invites → CREATE_INVITE (8) ──
create or replace function public.create_server_invite(p_server uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tok text;
begin
  if not public.has_perm(p_server, 8) then raise exception 'forbidden'; end if;
  select token into tok from public.server_invites where server_id = p_server;
  if tok is not null then return tok; end if;
  tok := replace(gen_random_uuid()::text, '-', '');
  insert into public.server_invites (token, server_id, inviter_id) values (tok, p_server, me)
  on conflict (server_id) do update set token = public.server_invites.token
  returning token into tok;
  return tok;
end;
$$;

-- ── Messages → SEND_MESSAGES (16), USE_EMOJI (32), MANAGE_MESSAGES (64), READ_HISTORY (128) ──
drop function if exists public.send_channel_message(uuid, text, uuid);
create or replace function public.send_channel_message(p_channel uuid, body text, reply uuid default null)
returns table (msg_id uuid, msg_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; v_id uuid; v_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null or not public.is_server_member(srv) then raise exception 'forbidden'; end if;
  if not public.has_perm(srv, 16) then raise exception 'forbidden'; end if;

  perform public.check_rate_limit('message', 15, 10);

  body := trim(body);
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;
  -- Stickers / GIFs / image links require USE_EMOJI.
  if (body like 'sticker:%' or body ~* '^https?://') and not public.has_perm(srv, 32) then
    raise exception 'forbidden';
  end if;

  insert into public.channel_messages (channel_id, sender_id, content, reply_to)
  values (p_channel, me, body, reply)
  returning channel_messages.id, channel_messages.created_at into v_id, v_at;

  if body ~* '@everyone([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm where sm.server_id = srv and sm.profile_id <> me;
  elsif body ~* '@here([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm join public.profiles p on p.id = sm.profile_id
    where sm.server_id = srv and sm.profile_id <> me
      and p.last_seen is not null and p.last_seen > now() - interval '2 minutes';
  else
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm join public.profiles p on p.id = sm.profile_id
    where sm.server_id = srv and sm.profile_id <> me
      and lower(body) ~ ('@' || lower(p.username) || '([^a-z0-9_]|$)');
  end if;

  msg_id := v_id; msg_created_at := v_at; return next;
end;
$$;
grant execute on function public.send_channel_message(uuid, text, uuid) to authenticated;

create or replace function public.delete_channel_message(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_sender uuid; v_server uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select m.sender_id, sc.server_id into v_sender, v_server
  from public.channel_messages m
  join public.server_channels sc on sc.id = m.channel_id
  where m.id = p_message;
  if v_server is null then raise exception 'not found'; end if;
  if me <> v_sender and not public.has_perm(v_server, 64) then raise exception 'forbidden'; end if;
  delete from public.channel_messages where id = p_message;
end;
$$;

-- READ_HISTORY (128) gate on reading channel messages.
create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.sender_id, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator
  from public.channel_messages m
  join public.profiles p on p.id = m.sender_id
  where m.channel_id = p_channel
    and public.is_channel_member(p_channel)
    and public.has_perm((select server_id from public.server_channels where id = p_channel), 128)
  order by m.created_at asc
  limit 200;
$$;
grant execute on function public.get_channel_messages(uuid) to authenticated;
