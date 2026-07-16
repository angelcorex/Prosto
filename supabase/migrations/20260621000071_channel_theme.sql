-- ─────────────────────────────────────────────────────────────────────────
-- Channel themes (Telegram-style chat wallpapers).
--
--   CHANGE_THEME (1024) — enforced permission to set a channel background.
--
-- A theme = background image + dim overlay (0..1) + focal point (x/y, 0..100).
-- It can be applied to a single channel, or server-wide (the default used by
-- every channel without its own theme). Owner implicitly has the permission.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.server_channels add column if not exists theme_image text;
alter table public.server_channels add column if not exists theme_dim  real;
alter table public.server_channels add column if not exists theme_x    real;
alter table public.server_channels add column if not exists theme_y    real;

alter table public.servers add column if not exists theme_image text;
alter table public.servers add column if not exists theme_dim  real;
alter table public.servers add column if not exists theme_x    real;
alter table public.servers add column if not exists theme_y    real;

-- Owner now implicitly holds CHANGE_THEME too (1023 | 1024 = 2047).
create or replace function public.server_perms(p_server uuid, p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.servers where id = p_server and owner_id = p_user) then 2047::bigint
    else coalesce((
      select bit_or(r.permissions)
      from public.server_roles r
      where r.server_id = p_server
        and (r.is_default or r.id in (
          select mr.role_id from public.server_member_roles mr where mr.profile_id = p_user
        ))
    ), 0::bigint)
  end;
$$;

-- ── Set a channel (or server-wide) theme → requires CHANGE_THEME (1024) ──
create or replace function public.set_channel_theme(
  p_channel uuid, p_image text default null, p_dim real default null,
  p_x real default null, p_y real default null, p_all boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1024) then raise exception 'forbidden'; end if;

  if p_all then
    update public.servers set
      theme_image = nullif(p_image, ''),
      theme_dim   = p_dim, theme_x = p_x, theme_y = p_y
    where id = srv;
  else
    update public.server_channels set
      theme_image = nullif(p_image, ''),
      theme_dim   = p_dim, theme_x = p_x, theme_y = p_y
    where id = p_channel;
  end if;
end;
$$;
grant execute on function public.set_channel_theme(uuid, text, real, real, real, boolean) to authenticated;

-- ── get_server_channels → effective theme (channel's own, else server default) ──
drop function if exists public.get_server_channels(uuid);
create or replace function public.get_server_channels(p_server uuid)
returns table(channel_id uuid, channel_public_id text, name text, type text,
  category_id uuid, category_name text, pos int, category_pos int,
  theme_image text, theme_dim real, theme_x real, theme_y real)
language sql stable security definer set search_path = public as $$
  select c.id, c.public_id::text, c.name, c.type,
    c.category_id, cat.name, c.position, coalesce(cat.position, 0),
    case when c.theme_image is not null then c.theme_image else s.theme_image end,
    case when c.theme_image is not null then c.theme_dim   else s.theme_dim   end,
    case when c.theme_image is not null then c.theme_x     else s.theme_x     end,
    case when c.theme_image is not null then c.theme_y     else s.theme_y     end
  from public.server_channels c
  join public.servers s on s.id = c.server_id
  left join public.server_categories cat on cat.id = c.category_id
  where c.server_id = p_server and public.is_server_member(p_server)
  order by coalesce(cat.position, 0) asc, c.position asc, c.created_at asc;
$$;
grant execute on function public.get_server_channels(uuid) to authenticated;
