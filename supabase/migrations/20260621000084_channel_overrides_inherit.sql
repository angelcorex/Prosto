-- ─────────────────────────────────────────────────────────────────────────
-- Fixes two UX issues in the channel/category overrides feature:
--
--   1. Category overrides are ALREADY applied to every channel by
--      `channel_perms` (Discord-style order), but the UI never surfaces them
--      — the channel editor only listed rows from `channel_role_overrides`,
--      so a user setting a permission on a category couldn't see it in the
--      channel and assumed it wasn't working. This migration replaces
--      `get_channel_overrides` with a combined view (channel-own ∪ inherited
--      from category), with a `source` column so the UI can tag each role.
--
--   2. The "Not synced" badge and Sync-button now derive from FACTS instead
--      of the `synced_to_category` flag: a channel is synced when it has no
--      rows in `channel_role_overrides`. This means opening the editor and
--      not touching anything doesn't leave the channel "desynced" forever.
--      We keep the column for backwards compat but stop consulting it.
--
-- `channel_perms` itself was already correct — category overrides applied
-- first, then channel overrides layered on top. We simplify it to drop the
-- now-defunct `synced_to_category` check (channel overrides are always
-- layered; an empty table is a no-op).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Combined channel-editor view.
--    role_id may repeat across channel and category — we prefer the channel
--    row when both exist (that's the effective override for that role) and
--    tag the source so the client can render an "inherited" badge.
drop function if exists public.get_channel_overrides(uuid);
create or replace function public.get_channel_overrides(p_channel uuid)
returns table(role_id uuid, allow bigint, deny bigint, source text)
language sql stable security definer set search_path = public as $$
  with ch as (
    select ro.role_id, ro.allow, ro.deny
    from public.channel_role_overrides ro
    join public.server_channels sc on sc.id = ro.channel_id
    where ro.channel_id = p_channel and public.is_server_member(sc.server_id)
  ),
  cat as (
    select cr.role_id, cr.allow, cr.deny
    from public.category_role_overrides cr
    join public.server_channels sc on sc.category_id = cr.category_id
    where sc.id = p_channel and public.is_server_member(sc.server_id)
  )
  select ch.role_id, ch.allow, ch.deny, 'channel'::text as source from ch
  union all
  select cat.role_id, cat.allow, cat.deny, 'category'::text as source
  from cat
  where cat.role_id not in (select role_id from ch);
$$;
grant execute on function public.get_channel_overrides(uuid) to authenticated;

-- 2. Simplified permission resolution — always layer both.
--    Order: base (union of user roles) → category @everyone → category roles
--    → channel @everyone → channel roles. Empty tables are no-ops so we can
--    drop the `synced_to_category` gate entirely.
create or replace function public.channel_perms(p_channel uuid, p_user uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  v_srv       uuid;
  v_cat       uuid;
  v_owner     boolean;
  v_base      bigint := 0;
  v_role_ids  uuid[];
  v_default   uuid;
  v_ev_a      bigint;
  v_ev_d      bigint;
  v_agg_a     bigint;
  v_agg_d     bigint;
begin
  select sc.server_id, sc.category_id
    into v_srv, v_cat
    from public.server_channels sc where sc.id = p_channel;
  if v_srv is null then return 0; end if;

  select (owner_id = p_user) into v_owner from public.servers where id = v_srv;
  if v_owner then return 4095::bigint; end if;

  select id into v_default from public.server_roles
    where server_id = v_srv and is_default limit 1;

  v_role_ids := array(
    select r.id from public.server_roles r
    where r.server_id = v_srv
      and (r.is_default or r.id in (
        select mr.role_id from public.server_member_roles mr where mr.profile_id = p_user
      ))
  );

  select coalesce(bit_or(permissions), 0::bigint)
    into v_base
    from public.server_roles
    where id = any(v_role_ids);

  -- Category overrides (if the channel has a parent category).
  if v_cat is not null then
    select coalesce(allow, 0), coalesce(deny, 0) into v_ev_a, v_ev_d
      from public.category_role_overrides
      where category_id = v_cat and role_id = v_default;
    v_base := (v_base & ~coalesce(v_ev_d, 0)) | coalesce(v_ev_a, 0);

    select coalesce(bit_or(allow), 0::bigint), coalesce(bit_or(deny), 0::bigint)
      into v_agg_a, v_agg_d
      from public.category_role_overrides
      where category_id = v_cat
        and role_id = any(v_role_ids)
        and role_id <> v_default;
    v_base := (v_base & ~coalesce(v_agg_d, 0)) | coalesce(v_agg_a, 0);
  end if;

  -- Channel overrides — always layered on top. Empty table = no-op.
  select coalesce(allow, 0), coalesce(deny, 0) into v_ev_a, v_ev_d
    from public.channel_role_overrides
    where channel_id = p_channel and role_id = v_default;
  v_base := (v_base & ~coalesce(v_ev_d, 0)) | coalesce(v_ev_a, 0);

  select coalesce(bit_or(allow), 0::bigint), coalesce(bit_or(deny), 0::bigint)
    into v_agg_a, v_agg_d
    from public.channel_role_overrides
    where channel_id = p_channel
      and role_id = any(v_role_ids)
      and role_id <> v_default;
  v_base := (v_base & ~coalesce(v_agg_d, 0)) | coalesce(v_agg_a, 0);

  return v_base;
end;
$$;
grant execute on function public.channel_perms(uuid, uuid) to authenticated;

-- 3. Set/remove channel overrides no longer need to seed from the category.
--    With the combined view, the editor already displays inherited rows —
--    the user acts on the role they actually want to change, and only that
--    role becomes a channel-specific override. The rest keep inheriting.
create or replace function public.set_channel_role_override(
  p_channel uuid, p_role uuid, p_allow bigint, p_deny bigint
) returns void language plpgsql security definer set search_path = public as $$
declare v_srv uuid;
begin
  select server_id into v_srv from public.server_channels where id = p_channel;
  if v_srv is null then raise exception 'not found'; end if;
  if not public.has_perm(v_srv, 2) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.server_roles where id = p_role and server_id = v_srv) then
    raise exception 'role/server mismatch';
  end if;

  insert into public.channel_role_overrides (channel_id, role_id, allow, deny)
  values (p_channel, p_role, coalesce(p_allow, 0), coalesce(p_deny, 0))
  on conflict (channel_id, role_id) do update
    set allow = excluded.allow, deny = excluded.deny;

  -- Keep the legacy flag consistent for anyone still reading it.
  update public.server_channels set synced_to_category = false where id = p_channel;
end;
$$;
grant execute on function public.set_channel_role_override(uuid, uuid, bigint, bigint) to authenticated;

create or replace function public.remove_channel_role_override(p_channel uuid, p_role uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_srv uuid;
begin
  select server_id into v_srv from public.server_channels where id = p_channel;
  if v_srv is null then raise exception 'not found'; end if;
  if not public.has_perm(v_srv, 2) then raise exception 'forbidden'; end if;

  delete from public.channel_role_overrides where channel_id = p_channel and role_id = p_role;
  -- If nothing left, mark the channel as synced again (legacy flag).
  update public.server_channels set synced_to_category = not exists (
    select 1 from public.channel_role_overrides where channel_id = p_channel
  ) where id = p_channel;
end;
$$;
grant execute on function public.remove_channel_role_override(uuid, uuid) to authenticated;

-- Sync-back is unchanged conceptually: drop every channel override.
-- (The row above already recomputes the flag on the last delete, but we do
-- it explicitly here for readability.)
create or replace function public.sync_channel_to_category(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_srv uuid;
begin
  select server_id into v_srv from public.server_channels where id = p_channel;
  if v_srv is null then raise exception 'not found'; end if;
  if not public.has_perm(v_srv, 2) then raise exception 'forbidden'; end if;
  delete from public.channel_role_overrides where channel_id = p_channel;
  update public.server_channels set synced_to_category = true where id = p_channel;
end;
$$;
grant execute on function public.sync_channel_to_category(uuid) to authenticated;

-- 4. get_server_channels — synced_to_category now computed from facts, so
--    a stale flag can't lie to the sidebar/UI.
drop function if exists public.get_server_channels(uuid);
create or replace function public.get_server_channels(p_server uuid)
returns table(channel_id uuid, channel_public_id text, name text, type text,
  category_id uuid, category_name text, pos int, category_pos int,
  theme_image text, theme_dim real, theme_x real, theme_y real,
  synced_to_category boolean, my_channel_permissions bigint)
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
    public.channel_perms(c.id, auth.uid())
  from public.server_channels c
  join public.servers s on s.id = c.server_id
  left join public.server_categories cat on cat.id = c.category_id
  where c.server_id = p_server and public.is_server_member(p_server)
  order by coalesce(cat.position, 0) asc, c.position asc, c.created_at asc;
$$;
grant execute on function public.get_server_channels(uuid) to authenticated;
