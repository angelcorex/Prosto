-- ─────────────────────────────────────────────────────────────────────────
-- Extra (visual-only for now) role permissions.
--
-- The enforced permissions still live in the `permissions` bitmask. These new,
-- finer-grained toggles (ban / kick / timeout / voice / nickname / message &
-- channel & role & server sub-permissions, etc.) are stored as a list of keys
-- in `extra_perms`. They are NOT enforced yet — only persisted and displayed —
-- so future enforcement can simply read these keys.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.server_roles add column if not exists extra_perms text[] not null default '{}';

-- ── get_server_roles → expose extra_perms ──
drop function if exists public.get_server_roles(uuid);
create or replace function public.get_server_roles(p_server uuid)
returns table(id uuid, name text, color text, color2 text, glow text, icon_url text,
  permissions bigint, "position" int, is_default boolean, hoist boolean, mention_mode text,
  extra_perms text[])
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.color, r.color2, r.glow, r.icon_url, r.permissions, r.position,
    r.is_default, r.hoist, r.mention_mode, r.extra_perms
  from public.server_roles r
  where r.server_id = p_server and public.is_server_member(p_server)
  order by r.is_default asc, r.position desc, r.created_at asc;
$$;
grant execute on function public.get_server_roles(uuid) to authenticated;

-- ── update_role → also persist extra_perms ──
drop function if exists public.update_role(uuid, text, text, text, text, text, bigint, boolean, text, uuid[]);
create or replace function public.update_role(
  p_role uuid, p_name text default null, p_color text default null,
  p_color2 text default null, p_glow text default null, p_icon text default null,
  p_permissions bigint default null, p_hoist boolean default null,
  p_mention_mode text default null, p_mention_allow uuid[] default null,
  p_extra text[] default null
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
    mention_mode = coalesce(nullif(p_mention_mode, ''), mention_mode),
    extra_perms = coalesce(p_extra, extra_perms)
  where id = p_role;

  if p_mention_allow is not null then
    delete from public.server_role_mention_allow where role_id = p_role;
    insert into public.server_role_mention_allow (role_id, profile_id)
    select p_role, m.profile_id from public.server_members m
    where m.server_id = srv and m.profile_id = any(p_mention_allow)
    on conflict do nothing;
  end if;
end;
$$;
grant execute on function public.update_role(uuid, text, text, text, text, text, bigint, boolean, text, uuid[], text[]) to authenticated;
