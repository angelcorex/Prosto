-- ─────────────────────────────────────────────────────────────────────────
-- Refine 18+ server gating: instead of hiding an NSFW server from a non-adult
-- member (which redirected them away), keep the server visible but "locked" —
-- its channels are withheld so the client can render a "this server is 18+"
-- screen in place of the banner/channel list. Joining an NSFW server is still
-- blocked (migration 103), so this only affects existing members whose server
-- later became age-restricted.
-- ─────────────────────────────────────────────────────────────────────────

-- get_server: return the row again (no age filter) so the page/sidebar load
-- and can show the lock UI. Shape matches 20260621000102.
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
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;
grant execute on function public.get_server(text) to authenticated;

-- get_server_channels: withhold channels of an NSFW server from non-adults
-- (the "locked" state). Shape matches 20260621000102.
drop function if exists public.get_server_channels(uuid);
create or replace function public.get_server_channels(p_server uuid)
returns table(channel_id uuid, channel_public_id text, name text, type text,
  category_id uuid, category_name text, pos int, category_pos int,
  theme_image text, theme_dim real, theme_x real, theme_y real,
  synced_to_category boolean, my_channel_permissions bigint, is_nsfw boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.public_id::text, c.name, c.type,
    c.category_id, cat.name, c.position, coalesce(cat.position, 0),
    case when c.theme_image is not null then c.theme_image else s.theme_image end,
    case when c.theme_image is not null then c.theme_dim   else s.theme_dim   end,
    case when c.theme_image is not null then c.theme_x     else s.theme_x     end,
    case when c.theme_image is not null then c.theme_y     else s.theme_y     end,
    not exists (
      select 1 from public.channel_role_overrides ro where ro.channel_id = c.id
    ),
    public.channel_perms(c.id, auth.uid()),
    c.is_nsfw
  from public.server_channels c
  join public.servers s on s.id = c.server_id
  left join public.server_categories cat on cat.id = c.category_id
  where c.server_id = p_server
    and public.is_server_member(p_server)
    and (not s.is_nsfw or public.viewer_is_adult())
  order by coalesce(cat.position, 0) asc, c.position asc, c.created_at asc;
$$;
grant execute on function public.get_server_channels(uuid) to authenticated;

notify pgrst, 'reload schema';
