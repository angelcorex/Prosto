-- ─────────────────────────────────────────────────────────────────────────
-- Fix joining servers + role hoisting & mention controls.
--
--  • _ensure_profile() — guarantees the current user has a profiles row before
--    they're added to a server (some accounts authenticated via email code
--    never finished onboarding, which broke server_members' FK).
--  • server_roles.hoist        — show members with this role in their own
--    section above everyone else (respecting role position / hierarchy).
--  • server_roles.mention_mode — who may @mention the role:
--      'everyone' (default) | 'none' | 'selected'
--  • server_role_mention_allow — the allow-list used when mention_mode='selected'.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Ensure the caller has a profile (auto-provision a safe username) ──
create or replace function public._ensure_profile()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); base text; uname text; n int := 0;
begin
  if me is null then return; end if;
  if exists (select 1 from public.profiles where id = me) then return; end if;

  select lower(coalesce(split_part(email, '@', 1), '')) into base from auth.users where id = me;
  base := regexp_replace(coalesce(base, ''), '[^a-z0-9_]', '', 'g');
  base := regexp_replace(base, '^_+', '', 'g');
  base := regexp_replace(base, '_+$', '', 'g');
  if char_length(base) < 3 then
    base := 'user' || substr(replace(me::text, '-', ''), 1, 6);
  end if;
  base := regexp_replace(left(base, 24), '_+$', '', 'g');

  uname := base;
  while exists (select 1 from public.profiles where lower(username) = lower(uname)) loop
    n := n + 1;
    uname := left(base, 22) || n::text;
  end loop;

  insert into public.profiles (id, username) values (me, uname) on conflict (id) do nothing;
end;
$$;
grant execute on function public._ensure_profile() to authenticated;

-- ── Repair join paths: provision a profile first, then add membership ──
create or replace function public.join_public_server(p_public_id text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  perform public._ensure_profile();
  select id into srv from public.servers where public_id::text = p_public_id and is_public = true;
  if srv is null then raise exception 'not found'; end if;
  insert into public.server_members (server_id, profile_id) values (srv, me) on conflict do nothing;
  return p_public_id;
end;
$$;
grant execute on function public.join_public_server(text) to authenticated;

create or replace function public.accept_server_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; pid text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  perform public._ensure_profile();
  select server_id into srv from public.server_invites where token = p_token;
  if srv is null then
    select id into srv from public.servers where vanity = lower(p_token);
  end if;
  if srv is null then raise exception 'invalid invite'; end if;
  insert into public.server_members (server_id, profile_id) values (srv, me) on conflict do nothing;
  select public_id::text into pid from public.servers where id = srv;
  return pid;
end;
$$;
grant execute on function public.accept_server_invite(text) to authenticated;

-- ── New role columns ──
alter table public.server_roles add column if not exists hoist boolean not null default false;
alter table public.server_roles add column if not exists mention_mode text not null default 'everyone';
do $$ begin
  alter table public.server_roles add constraint server_roles_mention_mode_chk
    check (mention_mode in ('everyone', 'none', 'selected'));
exception when duplicate_object then null; end $$;

create table if not exists public.server_role_mention_allow (
  role_id    uuid not null references public.server_roles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (role_id, profile_id)
);
alter table public.server_role_mention_allow enable row level security;
drop policy if exists "role mention allow read" on public.server_role_mention_allow;
create policy "role mention allow read" on public.server_role_mention_allow for select using (
  exists (select 1 from public.server_roles r where r.id = role_id and public.is_server_member(r.server_id))
);

-- ── get_server_roles → hoist + mention_mode ──
drop function if exists public.get_server_roles(uuid);
create or replace function public.get_server_roles(p_server uuid)
returns table(id uuid, name text, color text, color2 text, glow text, icon_url text,
  permissions bigint, "position" int, is_default boolean, hoist boolean, mention_mode text)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.color, r.color2, r.glow, r.icon_url, r.permissions, r.position,
    r.is_default, r.hoist, r.mention_mode
  from public.server_roles r
  where r.server_id = p_server and public.is_server_member(p_server)
  order by r.is_default asc, r.position desc, r.created_at asc;
$$;
grant execute on function public.get_server_roles(uuid) to authenticated;

-- ── update_role → hoist, mention_mode, and the selected allow-list ──
drop function if exists public.update_role(uuid, text, text, text, text, text, bigint);
create or replace function public.update_role(
  p_role uuid, p_name text default null, p_color text default null,
  p_color2 text default null, p_glow text default null, p_icon text default null,
  p_permissions bigint default null, p_hoist boolean default null,
  p_mention_mode text default null, p_mention_allow uuid[] default null
)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid; is_def boolean;
begin
  select server_id, is_default into srv, is_def from public.server_roles where id = p_role;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 2) then raise exception 'forbidden'; end if;
  update public.server_roles set
    name        = case when is_def then name else coalesce(nullif(trim(coalesce(p_name,'')),''), name) end,
    color       = case when is_def then color  else (case when p_color  = '' then null when p_color  is not null then p_color  else color  end) end,
    color2      = case when is_def then color2 else (case when p_color2 = '' then null when p_color2 is not null then p_color2 else color2 end) end,
    glow        = case when is_def then glow   else (case when p_glow   = '' then null when p_glow   is not null then p_glow   else glow   end) end,
    icon_url    = case when is_def then icon_url else (case when p_icon = '' then null when p_icon is not null then p_icon else icon_url end) end,
    permissions = coalesce(p_permissions, permissions),
    hoist       = coalesce(p_hoist, hoist),
    mention_mode = coalesce(nullif(p_mention_mode, ''), mention_mode)
  where id = p_role;

  -- Replace the allow-list when one is supplied (only meaningful for 'selected').
  if p_mention_allow is not null then
    delete from public.server_role_mention_allow where role_id = p_role;
    insert into public.server_role_mention_allow (role_id, profile_id)
    select p_role, m.profile_id from public.server_members m
    where m.server_id = srv and m.profile_id = any(p_mention_allow)
    on conflict do nothing;
  end if;
end;
$$;
grant execute on function public.update_role(uuid, text, text, text, text, text, bigint, boolean, text, uuid[]) to authenticated;

-- ── Read the mention allow-list for a role ──
create or replace function public.get_role_mention_allow(p_role uuid)
returns table(profile_id uuid)
language sql stable security definer set search_path = public as $$
  select a.profile_id from public.server_role_mention_allow a
  join public.server_roles r on r.id = a.role_id
  where a.role_id = p_role and public.is_server_member(r.server_id);
$$;
grant execute on function public.get_role_mention_allow(uuid) to authenticated;

-- ── get_server_members → top hoist role (for grouping by hierarchy) ──
drop function if exists public.get_server_members(uuid);
create or replace function public.get_server_members(p_server uuid)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, status text, last_seen timestamptz, is_owner boolean,
  role_color text, role_color2 text, role_glow text, role_icon text,
  hoist_role_id uuid, hoist_role_name text, hoist_role_pos int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator,
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

-- create_server also provisions a profile defensively.
create or replace function public.create_server(p_name text, p_icon text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; cat uuid; pid text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'invalid name'; end if;
  perform public._ensure_profile();

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

-- ── send_channel_message → notify on role mentions (respecting mention_mode) ──
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

  -- Role mentions: @<rolename> for single-token role names, gated by mention_mode.
  insert into public.notifications (user_id, type, actor_id, ref_id)
  select distinct mr.profile_id, 'mention', me, p_channel
  from public.server_roles r
  join public.server_member_roles mr on mr.role_id = r.id
  where r.server_id = srv
    and not r.is_default
    and r.name ~ '^[A-Za-z0-9_]+$'
    and lower(body) ~ ('@' || lower(r.name) || '([^a-z0-9_]|$)')
    and mr.profile_id <> me
    and (
      r.mention_mode = 'everyone'
      or (r.mention_mode = 'selected'
          and exists (select 1 from public.server_role_mention_allow a
                      where a.role_id = r.id and a.profile_id = me))
    );

  msg_id := v_id; msg_created_at := v_at; return next;
end;
$$;
grant execute on function public.send_channel_message(uuid, text, uuid) to authenticated;

-- ── get_channel_messages → include the sender's top role colour/gradient/glow ──
drop function if exists public.get_channel_messages(uuid);
create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean,
  sender_role_color text, sender_role_color2 text, sender_role_glow text)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.sender_id, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator,
    (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.color2 from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.glow from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.glow is not null
       order by r.position desc limit 1)
  from public.channel_messages m
  join public.profiles p on p.id = m.sender_id
  join public.server_channels sc on sc.id = m.channel_id
  where m.channel_id = p_channel
    and public.is_channel_member(p_channel)
    and public.has_perm(sc.server_id, 128)
  order by m.created_at asc
  limit 200;
$$;
grant execute on function public.get_channel_messages(uuid) to authenticated;
