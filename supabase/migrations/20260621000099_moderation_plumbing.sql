-- ─────────────────────────────────────────────────────────────────────────
-- Re-assert three functions so the new moderation state is enforced/exposed:
--   1. send_channel_message — a timed-out member cannot send anywhere.
--   2. get_server           — returns the caller's own timeout (for the banner).
--   3. get_server_members   — returns each member's timeout_until (for the UI).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. send_channel_message (+ timeout gate) — latest def from 20260621000090.
drop function if exists public.send_channel_message(uuid, text, uuid);
create or replace function public.send_channel_message(p_channel uuid, body text, reply uuid default null)
returns table (msg_id uuid, msg_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; cperms bigint; v_id uuid; v_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null or not public.is_server_member(srv) then raise exception 'forbidden'; end if;

  -- Active server timeout (mute) blocks sending in every channel.
  if exists (
    select 1 from public.server_members sm
    where sm.server_id = srv and sm.profile_id = me
      and sm.timeout_until is not null and sm.timeout_until > now()
  ) then raise exception 'timed_out'; end if;

  cperms := public.channel_perms(p_channel, me);
  if (cperms & 16) = 0 then raise exception 'forbidden'; end if;

  perform public.check_rate_limit('message', 15, 10);

  body := trim(body);
  if body = '' or char_length(body) > public.message_char_limit(me) then raise exception 'invalid content'; end if;
  -- Stickers require USE_EMOJI on this channel.
  if body like 'sticker:%' and (cperms & 32) = 0 then raise exception 'forbidden'; end if;

  insert into public.channel_messages (channel_id, sender_id, content, reply_to)
  values (p_channel, me, body, reply)
  returning channel_messages.id, channel_messages.created_at into v_id, v_at;

  -- Mentions (server-wide; not gated per-channel).
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

  -- Role mentions (respect mention_mode).
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

-- 2. get_server (+ caller's timeout) — latest def from 20260621000066.
drop function if exists public.get_server(text);
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, vanity text, description text, tags text[], is_public boolean,
  owner_id uuid, is_owner boolean, member_count int, my_permissions bigint,
  my_timeout_until timestamptz, my_timeout_reason text)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified, s.vanity,
    s.description, s.tags, s.is_public, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id),
    public.server_perms(s.id, auth.uid()),
    (select sm.timeout_until  from public.server_members sm where sm.server_id = s.id and sm.profile_id = auth.uid()),
    (select sm.timeout_reason from public.server_members sm where sm.server_id = s.id and sm.profile_id = auth.uid())
  from public.servers s
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;
grant execute on function public.get_server(text) to authenticated;

-- 3. get_server_members (+ timeout_until) — latest def from 20260621000089.
drop function if exists public.get_server_members(uuid);
create or replace function public.get_server_members(p_server uuid)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, is_premium boolean, status text, last_seen timestamptz, is_owner boolean,
  role_color text, role_color2 text, role_glow text, role_icon text,
  hoist_role_id uuid, hoist_role_name text, hoist_role_pos int, timeout_until timestamptz)
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
       order by r.position desc limit 1),
    sm.timeout_until
  from public.server_members sm
  join public.profiles p on p.id = sm.profile_id
  join public.servers s on s.id = sm.server_id
  where sm.server_id = p_server and public.is_server_member(p_server)
  order by (s.owner_id = p.id) desc, p.username asc;
$$;
grant execute on function public.get_server_members(uuid) to authenticated;

-- 4. my_server_mod — the caller's moderation capabilities on a server, so the
--    profile popup can show kick/ban/timeout without loading the full server.
create or replace function public.my_server_mod(p_server uuid)
returns table(is_owner boolean, can_kick boolean, can_ban boolean, can_timeout boolean)
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()),
    public.can_mod(p_server, 4096),
    public.can_mod(p_server, 8192),
    public.can_mod(p_server, 16384)
  where public.is_server_member(p_server);
$$;
grant execute on function public.my_server_mod(uuid) to authenticated;

notify pgrst, 'reload schema';
