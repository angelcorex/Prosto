-- Server verification badge (like verified profiles) + new channels are
-- appended to the END of their category instead of jumping to the top.

alter table public.servers add column if not exists is_verified boolean not null default false;

-- create_channel: keep the 50/category cap, append at the end (max position + 1).
drop function if exists public.create_channel(uuid, text, uuid);
create or replace function public.create_channel(p_server uuid, p_name text, p_category uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare pid text; cnt int; next_pos int;
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_category is not null then
    select count(*) into cnt from public.server_channels where server_id = p_server and category_id = p_category;
    if cnt >= 50 then raise exception 'category full'; end if;
  end if;
  select coalesce(max(position) + 1, 0) into next_pos
  from public.server_channels
  where server_id = p_server and category_id is not distinct from p_category;
  insert into public.server_channels (server_id, category_id, name, position)
  values (p_server, p_category, trim(p_name), next_pos)
  returning public_id::text into pid;
  return pid;
end;
$$;
grant execute on function public.create_channel(uuid, text, uuid) to authenticated;

-- get_server now exposes is_verified.
drop function if exists public.get_server(text);
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, owner_id uuid, is_owner boolean, member_count int)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id)
  from public.servers s
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;
grant execute on function public.get_server(text) to authenticated;

-- get_my_servers now exposes is_verified (rail tooltips / future badges).
drop function if exists public.get_my_servers();
create or replace function public.get_my_servers()
returns table(id uuid, public_id text, name text, icon_url text, is_verified boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.is_verified
  from public.servers s
  join public.server_members sm on sm.server_id = s.id
  where sm.profile_id = auth.uid()
  order by s.created_at asc;
$$;
grant execute on function public.get_my_servers() to authenticated;

-- get_server_invite now exposes is_verified (invite preview).
drop function if exists public.get_server_invite(text);
create or replace function public.get_server_invite(p_token text)
returns table(server_id uuid, public_id text, name text, icon_url text, is_verified boolean,
  member_count int, inviter_username text)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.is_verified,
    (select count(*)::int from public.server_members sm where sm.server_id = s.id),
    p.username
  from public.server_invites i
  join public.servers s on s.id = i.server_id
  join public.profiles p on p.id = i.inviter_id
  where i.token = p_token;
$$;
grant execute on function public.get_server_invite(text) to anon, authenticated;
