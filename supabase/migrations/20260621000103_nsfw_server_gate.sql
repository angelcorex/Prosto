-- ─────────────────────────────────────────────────────────────────────────
-- Hard age-gate for 18+ servers (enforced server-side, not just in the UI):
--   • under-18 / no-birth-date users cannot JOIN an NSFW server (public join
--     or invite) and cannot VIEW one (get_server returns nothing → the page
--     redirects, the sidebar never loads it),
--   • NSFW servers are hidden from Discover for non-adults,
--   • a non-adult cannot flip a server's NSFW flag on.
-- ─────────────────────────────────────────────────────────────────────────

-- Current caller's adult status (18+ with a stored birth date).
create or replace function public.viewer_is_adult()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_adult((select birth_date from public.profiles where id = auth.uid()));
$$;
grant execute on function public.viewer_is_adult() to authenticated;

-- ── join_public_server (+ NSFW age gate) — re-declared from 20260621000098 ──
create or replace function public.join_public_server(p_public_id text, p_ip text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; v_ip text := nullif(trim(coalesce(p_ip, '')), ''); v_nsfw boolean;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select id, is_nsfw into srv, v_nsfw from public.servers where public_id::text = p_public_id and is_public = true;
  if srv is null then raise exception 'not found'; end if;
  if v_nsfw and not public.viewer_is_adult() then raise exception 'age_restricted'; end if;
  if exists (
    select 1 from public.server_bans b
    where b.server_id = srv
      and (b.user_id = me or (v_ip is not null and b.banned_ip = v_ip))
  ) then raise exception 'banned'; end if;
  insert into public.server_members (server_id, profile_id) values (srv, me) on conflict do nothing;
  return p_public_id;
end;
$$;
grant execute on function public.join_public_server(text, text) to authenticated;

-- ── accept_server_invite (+ NSFW age gate) — re-declared from 20260621000101 ──
drop function if exists public.accept_server_invite(text, text);
create or replace function public.accept_server_invite(
  p_token text,
  p_ip    text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  srv   uuid;
  v_ip  text := nullif(trim(coalesce(p_ip, '')), '');
  v_exp timestamptz;
  v_max int;
  v_uses int;
  v_nsfw boolean;
  pid   text;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  select server_id, expires_at, max_uses, uses
    into srv, v_exp, v_max, v_uses
    from public.server_invites where token = p_token;

  if srv is null then raise exception 'invalid invite'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'invite_expired'; end if;
  if v_max is not null and v_uses >= v_max then raise exception 'invite_maxed'; end if;

  select is_nsfw into v_nsfw from public.servers where id = srv;
  if v_nsfw and not public.viewer_is_adult() then raise exception 'age_restricted'; end if;

  if exists (
    select 1 from public.servers
    where id = srv
      and invites_paused_until is not null
      and invites_paused_until > now()
  ) then
    raise exception 'invites_paused';
  end if;

  if exists (
    select 1 from public.server_bans b
    where b.server_id = srv
      and (b.user_id = me or (v_ip is not null and b.banned_ip = v_ip))
  ) then
    raise exception 'banned';
  end if;

  select public_id::text into pid from public.servers where id = srv;

  if exists (select 1 from public.server_members where server_id = srv and profile_id = me) then
    return pid;
  end if;

  insert into public.server_members (server_id, profile_id) values (srv, me);
  update public.server_invites set uses = uses + 1 where token = p_token;
  return pid;
end;
$$;
grant execute on function public.accept_server_invite(text, text) to authenticated;

-- ── get_server (+ NSFW view gate) — re-declared from 20260621000102 ──
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
  where s.public_id::text = p_public_id
    and public.is_server_member(s.id)
    and (not s.is_nsfw or public.viewer_is_adult());
$$;
grant execute on function public.get_server(text) to authenticated;

-- ── discover_servers (hide NSFW from non-adults) — re-declared from 20260621000061 ──
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
      and (not s.is_nsfw or public.viewer_is_adult())
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
grant execute on function public.discover_servers(text, text, int) to authenticated, anon;

-- ── update_server (block non-adults from enabling NSFW) — re-declared from 20260621000102 ──
drop function if exists public.update_server(uuid, text, text, text, text, text[], boolean, boolean);
create or replace function public.update_server(
  p_server uuid, p_name text default null, p_icon text default null, p_banner text default null,
  p_description text default null, p_tags text[] default null, p_is_public boolean default null,
  p_is_nsfw boolean default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 4) then raise exception 'forbidden'; end if;
  if p_is_nsfw is true and not public.viewer_is_adult() then raise exception 'age_restricted'; end if;
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

notify pgrst, 'reload schema';
