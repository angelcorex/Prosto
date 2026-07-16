-- Server banner, channel-per-category limit (50), icon on create.

alter table public.servers add column if not exists banner_url text;

-- create_server now returns id + public_id so the client can upload an icon.
drop function if exists public.create_server(text, text);
create or replace function public.create_server(p_name text, p_icon text default null)
returns table(id uuid, public_id text)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; cat uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'invalid name'; end if;

  insert into public.servers (name, icon_url, owner_id)
  values (trim(p_name), p_icon, me) returning servers.id into srv;

  insert into public.server_members (server_id, profile_id) values (srv, me);
  insert into public.server_categories (server_id, name, position) values (srv, 'Text Channels', 0) returning server_categories.id into cat;
  insert into public.server_channels (server_id, category_id, name, position) values (srv, cat, 'general', 0);

  return query select s.id, s.public_id::text from public.servers s where s.id = srv;
end;
$$;

-- create_channel: enforce max 50 channels per category.
drop function if exists public.create_channel(uuid, text, uuid);
create or replace function public.create_channel(p_server uuid, p_name text, p_category uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare pid text; cnt int;
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_category is not null then
    select count(*) into cnt from public.server_channels where server_id = p_server and category_id = p_category;
    if cnt >= 50 then raise exception 'category full'; end if;
  end if;
  insert into public.server_channels (server_id, category_id, name)
  values (p_server, p_category, trim(p_name))
  returning public_id::text into pid;
  return pid;
end;
$$;

-- update_server now also sets the banner.
drop function if exists public.update_server(uuid, text, text);
create or replace function public.update_server(p_server uuid, p_name text default null, p_icon text default null, p_banner text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.servers set
    name = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
    icon_url = coalesce(p_icon, icon_url),
    banner_url = coalesce(p_banner, banner_url)
  where id = p_server;
end;
$$;

-- get_server now exposes banner_url.
drop function if exists public.get_server(text);
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text, owner_id uuid, is_owner boolean, member_count int)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id)
  from public.servers s
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;

grant execute on function public.create_server(text, text) to authenticated;
grant execute on function public.create_channel(uuid, text, uuid) to authenticated;
grant execute on function public.update_server(uuid, text, text, text) to authenticated;
grant execute on function public.get_server(text) to authenticated;
