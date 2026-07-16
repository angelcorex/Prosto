-- ─────────────────────────────────────────────────────────────────────────
-- Role visual upgrades: gradient colours + a separate "aurora" glow.
--   color   — primary role colour (also the gradient start)
--   color2  — optional gradient end colour (when set, the name is a gradient)
--   glow    — optional glow colour, rendered as a separate aurora element
--             next to the name (independent of the text colour)
-- All three are ignored for the default @everyone role.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.server_roles add column if not exists color2 text;
alter table public.server_roles add column if not exists glow   text;

-- ── get_server_roles → expose color2 + glow ──
drop function if exists public.get_server_roles(uuid);
create or replace function public.get_server_roles(p_server uuid)
returns table(id uuid, name text, color text, color2 text, glow text, icon_url text,
  permissions bigint, "position" int, is_default boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.color, r.color2, r.glow, r.icon_url, r.permissions, r.position, r.is_default
  from public.server_roles r
  where r.server_id = p_server and public.is_server_member(p_server)
  order by r.is_default asc, r.position desc, r.created_at asc;
$$;
grant execute on function public.get_server_roles(uuid) to authenticated;

-- ── update_role → accept color2 + glow ('' clears, null keeps) ──
drop function if exists public.update_role(uuid, text, text, text, bigint);
create or replace function public.update_role(
  p_role uuid, p_name text default null, p_color text default null,
  p_color2 text default null, p_glow text default null,
  p_icon text default null, p_permissions bigint default null
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
    permissions = coalesce(p_permissions, permissions)
  where id = p_role;
end;
$$;
grant execute on function public.update_role(uuid, text, text, text, text, text, bigint) to authenticated;

-- ── get_server_members → expose the top role's color2 + glow ──
drop function if exists public.get_server_members(uuid);
create or replace function public.get_server_members(p_server uuid)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, status text, last_seen timestamptz, is_owner boolean,
  role_color text, role_color2 text, role_glow text, role_icon text)
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
       order by r.position desc limit 1)
  from public.server_members sm
  join public.profiles p on p.id = sm.profile_id
  join public.servers s on s.id = sm.server_id
  where sm.server_id = p_server and public.is_server_member(p_server)
  order by (s.owner_id = p.id) desc, p.username asc;
$$;
grant execute on function public.get_server_members(uuid) to authenticated;
