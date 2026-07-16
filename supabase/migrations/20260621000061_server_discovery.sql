-- ─────────────────────────────────────────────────────────────────────────
-- Server discovery: description + tags + public/private visibility, a search
-- RPC for the "monitoring" browser, and a direct join for public servers.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.servers add column if not exists description text
  check (description is null or char_length(description) <= 300);
alter table public.servers add column if not exists tags text[] not null default '{}';
alter table public.servers add column if not exists is_public boolean not null default false;

create index if not exists servers_public_idx on public.servers (is_public) where is_public;

-- update_server now also patches description / tags / visibility.
-- NULL keeps the current value; '' clears icon/banner/description.
drop function if exists public.update_server(uuid, text, text, text);
create or replace function public.update_server(
  p_server uuid,
  p_name text default null,
  p_icon text default null,
  p_banner text default null,
  p_description text default null,
  p_tags text[] default null,
  p_is_public boolean default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
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

-- get_server exposes the new fields.
drop function if exists public.get_server(text);
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, vanity text, description text, tags text[], is_public boolean,
  owner_id uuid, is_owner boolean, member_count int)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified, s.vanity,
    s.description, s.tags, s.is_public, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id)
  from public.servers s
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;
grant execute on function public.get_server(text) to authenticated;

-- Invite preview exposes description + tags (shown in the invite card/page).
drop function if exists public.get_server_invite(text);
create or replace function public.get_server_invite(p_token text)
returns table(server_id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, description text, tags text[], member_count int, online_count int, inviter_username text)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified,
    s.description, s.tags,
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

-- Discover public servers: free-text match over name/description/tags, sorted
-- by popularity (members desc), newest, or smallest. Only public servers.
create or replace function public.discover_servers(
  p_query text default null,
  p_sort text default 'popular',
  p_limit int default 60
)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, description text, tags text[], member_count int, online_count int,
  created_at timestamptz, is_member boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified,
      s.description, s.tags,
      (select count(*)::int from public.server_members sm where sm.server_id = s.id) as member_count,
      (select count(*)::int from public.server_members sm
         join public.profiles pp on pp.id = sm.profile_id
         where sm.server_id = s.id and pp.last_seen is not null
           and pp.last_seen > now() - interval '5 minutes') as online_count,
      s.created_at,
      public.is_server_member(s.id) as is_member
    from public.servers s
    where s.is_public = true
      and (
        nullif(trim(coalesce(p_query,'')),'') is null
        or s.name ilike '%' || trim(p_query) || '%'
        or coalesce(s.description,'') ilike '%' || trim(p_query) || '%'
        or exists (select 1 from unnest(s.tags) tg where tg ilike '%' || trim(p_query) || '%')
      )
  ) q
  order by
    (case when p_sort = 'new'   then extract(epoch from q.created_at) end) desc nulls last,
    (case when p_sort = 'small' then q.member_count end) asc nulls last,
    (case when p_sort not in ('new','small') then q.member_count end) desc nulls last,
    q.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 100));
$$;
grant execute on function public.discover_servers(text, text, int) to authenticated;

-- Join a public server straight from discovery (no invite token needed).
create or replace function public.join_public_server(p_public_id text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select id into srv from public.servers where public_id::text = p_public_id and is_public = true;
  if srv is null then raise exception 'not found'; end if;
  insert into public.server_members (server_id, profile_id) values (srv, me) on conflict do nothing;
  return p_public_id;
end;
$$;
grant execute on function public.join_public_server(text) to authenticated;
