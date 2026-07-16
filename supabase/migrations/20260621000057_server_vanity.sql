-- Custom server invite URL (vanity), e.g. /i/genshinimpact. Unique & checked
-- for availability like usernames. 2–20 chars: a–z, 0–9, hyphen.

alter table public.servers add column if not exists vanity text;
create unique index if not exists servers_vanity_key on public.servers (lower(vanity)) where vanity is not null;

create or replace function public._valid_vanity(v text)
returns boolean language sql immutable as $$
  select v ~ '^[a-z0-9][a-z0-9-]{1,19}$';
$$;

-- True when the vanity is free (case-insensitive), false when taken/invalid.
create or replace function public.check_server_vanity(p_vanity text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when not public._valid_vanity(lower(trim(p_vanity))) then false
    else not exists (select 1 from public.servers where lower(vanity) = lower(trim(p_vanity)))
  end;
$$;
grant execute on function public.check_server_vanity(text) to authenticated;

-- Owner-only: set or clear (''/null) the server vanity.
create or replace function public.set_server_vanity(p_server uuid, p_vanity text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := lower(trim(coalesce(p_vanity, '')));
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if v = '' then
    update public.servers set vanity = null where id = p_server;
    return;
  end if;
  if not public._valid_vanity(v) then raise exception 'invalid vanity'; end if;
  if exists (select 1 from public.servers where lower(vanity) = v and id <> p_server) then
    raise exception 'taken';
  end if;
  update public.servers set vanity = v where id = p_server;
end;
$$;
grant execute on function public.set_server_vanity(uuid, text) to authenticated;

-- get_server now exposes vanity.
drop function if exists public.get_server(text);
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, vanity text, owner_id uuid, is_owner boolean, member_count int)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified, s.vanity, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id)
  from public.servers s
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;
grant execute on function public.get_server(text) to authenticated;

-- Invite preview resolves either an invite token OR a server vanity.
drop function if exists public.get_server_invite(text);
create or replace function public.get_server_invite(p_token text)
returns table(server_id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, member_count int, online_count int, inviter_username text)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified,
    (select count(*)::int from public.server_members sm where sm.server_id = s.id),
    (select count(*)::int from public.server_members sm
       join public.profiles pp on pp.id = sm.profile_id
       where sm.server_id = s.id and pp.last_seen is not null
         and pp.last_seen > now() - interval '5 minutes'),
    p.username
  from public.servers s
  left join public.server_invites i on i.server_id = s.id
  left join public.profiles p on p.id = i.inviter_id
  where i.token = p_token or s.vanity = lower(p_token)
  limit 1;
$$;
grant execute on function public.get_server_invite(text) to anon, authenticated;

-- accept_server_invite resolves a vanity too.
create or replace function public.accept_server_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; pid text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
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
