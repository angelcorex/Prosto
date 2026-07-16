-- ─────────────────────────────────────────────────────────────────────────
-- Server Home customisation: a dedicated home banner (separate from the
-- server banner) and a shared whiteboard image saved for everyone.
-- Editing requires MANAGE_SERVER (4); the saved values are visible to all
-- members via get_server.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.servers add column if not exists home_banner     text;
alter table public.servers add column if not exists home_whiteboard text;

-- get_server → also return the home banner + whiteboard
drop function if exists public.get_server(text);
create or replace function public.get_server(p_public_id text)
returns table(id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, vanity text, description text, tags text[], is_public boolean,
  owner_id uuid, is_owner boolean, member_count int, my_permissions bigint,
  home_banner text, home_whiteboard text)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified, s.vanity,
    s.description, s.tags, s.is_public, s.owner_id,
    (s.owner_id = auth.uid()),
    (select count(*)::int from public.server_members sm where sm.server_id = s.id),
    public.server_perms(s.id, auth.uid()),
    s.home_banner, s.home_whiteboard
  from public.servers s
  where s.public_id::text = p_public_id and public.is_server_member(s.id);
$$;
grant execute on function public.get_server(text) to authenticated;

-- Save the home banner / whiteboard. '' clears, null keeps the current value.
create or replace function public.update_server_home(
  p_server uuid, p_banner text default null, p_whiteboard text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 4) then raise exception 'forbidden'; end if;
  update public.servers set
    home_banner     = case when p_banner     = '' then null when p_banner     is not null then p_banner     else home_banner     end,
    home_whiteboard = case when p_whiteboard = '' then null when p_whiteboard is not null then p_whiteboard else home_whiteboard end
  where id = p_server;
end;
$$;
grant execute on function public.update_server_home(uuid, text, text) to authenticated;
