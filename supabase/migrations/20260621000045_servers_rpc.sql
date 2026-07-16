-- RPCs for the servers feature. All SECURITY DEFINER; permission checks inside.

-- Create a server with a default category + #general channel; return public_id.
create or replace function public.create_server(p_name text, p_icon text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; cat uuid; pid text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'invalid name'; end if;

  insert into public.servers (name, icon_url, owner_id)
  values (trim(p_name), p_icon, me) returning id into srv;

  insert into public.server_members (server_id, profile_id) values (srv, me);

  insert into public.server_categories (server_id, name, position) values (srv, 'Text Channels', 0) returning id into cat;
  insert into public.server_channels (server_id, category_id, name, position) values (srv, cat, 'general', 0);

  select public_id::text into pid from public.servers where id = srv;
  return pid;
end;
$$;

-- Servers the caller belongs to (for the rail).
create or replace function public.get_my_servers()
returns table(id uuid, public_id text, name text, icon_url text)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url
  from public.servers s
  join public.server_members sm on sm.server_id = s.id
  where sm.profile_id = auth.uid()
  order by s.created_at asc;
$$;

-- Server header info by public id.
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, owner_id uuid, is_owner boolean, member_count int)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id)
  from public.servers s
  where s.public_id::text = p_public_id
    and public.is_server_member(s.id);
$$;

-- Channels + categories of a server.
create or replace function public.get_server_channels(p_server uuid)
returns table(channel_id uuid, channel_public_id text, name text, type text,
  category_id uuid, category_name text, pos int, category_pos int)
language sql stable security definer set search_path = public as $$
  select c.id, c.public_id::text, c.name, c.type,
    c.category_id, cat.name, c.position, coalesce(cat.position, 0)
  from public.server_channels c
  left join public.server_categories cat on cat.id = c.category_id
  where c.server_id = p_server and public.is_server_member(p_server)
  order by coalesce(cat.position, 0) asc, c.position asc, c.created_at asc;
$$;

-- Members of a server.
create or replace function public.get_server_members(p_server uuid)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, status text, last_seen timestamptz, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator,
    p.status, p.last_seen, (s.owner_id = p.id)
  from public.server_members sm
  join public.profiles p on p.id = sm.profile_id
  join public.servers s on s.id = sm.server_id
  where sm.server_id = p_server and public.is_server_member(p_server)
  order by (s.owner_id = p.id) desc, p.username asc;
$$;

-- Owner-only management.
create or replace function public.create_channel(p_server uuid, p_name text, p_category uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  insert into public.server_channels (server_id, category_id, name)
  values (p_server, p_category, trim(p_name))
  returning public_id::text into pid;
  return pid;
end;
$$;

create or replace function public.create_category(p_server uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  insert into public.server_categories (server_id, name, position)
  values (p_server, trim(p_name),
    coalesce((select max(position)+1 from public.server_categories where server_id = p_server), 1));
end;
$$;

create or replace function public.update_server(p_server uuid, p_name text, p_icon text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.servers set
    name = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
    icon_url = coalesce(p_icon, icon_url)
  where id = p_server;
end;
$$;

create or replace function public.delete_server(p_server uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  delete from public.servers where id = p_server;
end;
$$;

create or replace function public.leave_server(p_server uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Owner can't leave (must delete); others leave freely.
  if exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'owner cannot leave';
  end if;
  delete from public.server_members where server_id = p_server and profile_id = auth.uid();
end;
$$;

-- ── Invites ──
create or replace function public.create_server_invite(p_server uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tok text;
begin
  if not public.is_server_member(p_server) then raise exception 'forbidden'; end if;
  select token into tok from public.server_invites where server_id = p_server;
  if tok is not null then return tok; end if;
  tok := replace(gen_random_uuid()::text, '-', '');
  insert into public.server_invites (token, server_id, inviter_id) values (tok, p_server, me)
  on conflict (server_id) do update set token = public.server_invites.token
  returning token into tok;
  return tok;
end;
$$;

create or replace function public.get_server_invite(p_token text)
returns table(server_id uuid, public_id text, name text, icon_url text, member_count int,
  inviter_username text)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url,
    (select count(*)::int from public.server_members sm where sm.server_id = s.id),
    p.username
  from public.server_invites i
  join public.servers s on s.id = i.server_id
  join public.profiles p on p.id = i.inviter_id
  where i.token = p_token;
$$;

create or replace function public.accept_server_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; pid text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select server_id into srv from public.server_invites where token = p_token;
  if srv is null then raise exception 'invalid invite'; end if;
  insert into public.server_members (server_id, profile_id) values (srv, me) on conflict do nothing;
  select public_id::text into pid from public.servers where id = srv;
  return pid;
end;
$$;

-- ── Channel messages ──
create or replace function public.send_channel_message(p_channel uuid, body text, reply uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; new_id uuid; new_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select server_id into srv from public.server_channels where id = p_channel;
  if srv is null or not public.is_server_member(srv) then raise exception 'forbidden'; end if;

  perform public.check_rate_limit('message', 15, 10);

  body := trim(body);
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;

  insert into public.channel_messages (channel_id, sender_id, content, reply_to)
  values (p_channel, me, body, reply)
  returning channel_messages.id, channel_messages.created_at into new_id, new_at;

  -- Mentions → bell notifications for server members (never the sender).
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

  return query select new_id, new_at;
end;
$$;

create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.sender_id, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator
  from public.channel_messages m
  join public.profiles p on p.id = m.sender_id
  where m.channel_id = p_channel and public.is_channel_member(p_channel)
  order by m.created_at asc
  limit 200;
$$;

-- Grants
revoke all on function public.create_server(text, text) from public, anon;
grant execute on function public.create_server(text, text) to authenticated;
grant execute on function public.get_my_servers() to authenticated;
grant execute on function public.get_server(text) to authenticated;
grant execute on function public.get_server_channels(uuid) to authenticated;
grant execute on function public.get_server_members(uuid) to authenticated;
grant execute on function public.create_channel(uuid, text, uuid) to authenticated;
grant execute on function public.create_category(uuid, text) to authenticated;
grant execute on function public.update_server(uuid, text, text) to authenticated;
grant execute on function public.delete_server(uuid) to authenticated;
grant execute on function public.leave_server(uuid) to authenticated;
grant execute on function public.create_server_invite(uuid) to authenticated;
grant execute on function public.get_server_invite(text) to anon, authenticated;
grant execute on function public.accept_server_invite(text) to authenticated;
grant execute on function public.send_channel_message(uuid, text, uuid) to authenticated;
grant execute on function public.get_channel_messages(uuid) to authenticated;
