-- ─────────────────────────────────────────────────────────────────────────
-- Per-channel and per-category role permission overrides (Discord-style).
--
-- Each override says "for this role on this channel/category, ALLOW these
-- bits, DENY those bits". Effective permissions for a user on a channel are:
--
--   1. Owner → all bits (4095, mirroring server_perms in migration 82).
--   2. base = OR of `permissions` across the user's roles (incl. @everyone).
--   3. If the channel has a category: apply category overrides in Discord's
--      canonical order:
--        a. category @everyone override:  base = (base & ~deny) | allow
--        b. aggregated category role overrides for the user's other roles:
--             deny_all = OR(deny)   → base &= ~deny_all
--             allow_all = OR(allow) → base |= allow_all
--   4. If the channel is NOT synced to its category (or has no category),
--      apply the same two-step to the channel's OWN overrides.
--
-- The `synced_to_category` flag lives on `server_channels`. When true, the
-- channel behaves exactly like its category — no channel-specific overrides
-- are consulted, and the UI shows a "Synced" badge. Any write to a channel
-- override auto-unsyncs the channel (and seeds it from the category so the
-- editor doesn't start blank), so the change is a clean fork.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Storage ────────────────────────────────────────────────────────────────
create table if not exists public.channel_role_overrides (
  channel_id uuid   not null references public.server_channels(id) on delete cascade,
  role_id    uuid   not null references public.server_roles(id)    on delete cascade,
  allow      bigint not null default 0,
  deny       bigint not null default 0,
  primary key (channel_id, role_id)
);
create index if not exists channel_role_overrides_role_idx on public.channel_role_overrides (role_id);

create table if not exists public.category_role_overrides (
  category_id uuid   not null references public.server_categories(id) on delete cascade,
  role_id     uuid   not null references public.server_roles(id)      on delete cascade,
  allow       bigint not null default 0,
  deny        bigint not null default 0,
  primary key (category_id, role_id)
);
create index if not exists category_role_overrides_role_idx on public.category_role_overrides (role_id);

alter table public.server_channels
  add column if not exists synced_to_category boolean not null default true;

-- ── RLS: server members can read; writes go through SECURITY DEFINER RPCs ──
alter table public.channel_role_overrides  enable row level security;
alter table public.category_role_overrides enable row level security;

drop policy if exists "channel overrides read"  on public.channel_role_overrides;
drop policy if exists "category overrides read" on public.category_role_overrides;

create policy "channel overrides read" on public.channel_role_overrides
  for select using (exists (
    select 1 from public.server_channels sc
    where sc.id = channel_id and public.is_server_member(sc.server_id)
  ));

create policy "category overrides read" on public.category_role_overrides
  for select using (exists (
    select 1 from public.server_categories cat
    where cat.id = category_id and public.is_server_member(cat.server_id)
  ));

-- Realtime — the editor and channel-chat will react to changes live.
alter table public.channel_role_overrides  replica identity full;
alter table public.category_role_overrides replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.channel_role_overrides;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.category_role_overrides; exception when duplicate_object then null; end;
end $$;

-- ── Read RPCs (all server members can read, so the editor can render) ──────
create or replace function public.get_channel_overrides(p_channel uuid)
returns table(role_id uuid, allow bigint, deny bigint)
language sql stable security definer set search_path = public as $$
  select ro.role_id, ro.allow, ro.deny
  from public.channel_role_overrides ro
  join public.server_channels sc on sc.id = ro.channel_id
  where ro.channel_id = p_channel and public.is_server_member(sc.server_id);
$$;
grant execute on function public.get_channel_overrides(uuid) to authenticated;

create or replace function public.get_category_overrides(p_category uuid)
returns table(role_id uuid, allow bigint, deny bigint)
language sql stable security definer set search_path = public as $$
  select ro.role_id, ro.allow, ro.deny
  from public.category_role_overrides ro
  join public.server_categories cat on cat.id = ro.category_id
  where ro.category_id = p_category and public.is_server_member(cat.server_id);
$$;
grant execute on function public.get_category_overrides(uuid) to authenticated;

-- ── Write RPCs (MANAGE_ROLES = bit 2) ──────────────────────────────────────
-- Seeding: when a synced channel is first edited we copy the category's
-- current overrides into channel_role_overrides so the editor doesn't start
-- blank and the "diff" from category is intentional.
create or replace function public._seed_channel_from_category(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cat uuid;
begin
  select category_id into v_cat from public.server_channels
    where id = p_channel and synced_to_category and category_id is not null;
  if v_cat is null then return; end if;
  insert into public.channel_role_overrides (channel_id, role_id, allow, deny)
  select p_channel, cr.role_id, cr.allow, cr.deny
  from public.category_role_overrides cr
  where cr.category_id = v_cat
  on conflict do nothing;
end;
$$;

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

  perform public._seed_channel_from_category(p_channel);

  insert into public.channel_role_overrides (channel_id, role_id, allow, deny)
  values (p_channel, p_role, coalesce(p_allow, 0), coalesce(p_deny, 0))
  on conflict (channel_id, role_id) do update
    set allow = excluded.allow, deny = excluded.deny;

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

  perform public._seed_channel_from_category(p_channel);

  delete from public.channel_role_overrides where channel_id = p_channel and role_id = p_role;
  update public.server_channels set synced_to_category = false where id = p_channel;
end;
$$;
grant execute on function public.remove_channel_role_override(uuid, uuid) to authenticated;

create or replace function public.set_category_role_override(
  p_category uuid, p_role uuid, p_allow bigint, p_deny bigint
) returns void language plpgsql security definer set search_path = public as $$
declare v_srv uuid;
begin
  select server_id into v_srv from public.server_categories where id = p_category;
  if v_srv is null then raise exception 'not found'; end if;
  if not public.has_perm(v_srv, 2) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.server_roles where id = p_role and server_id = v_srv) then
    raise exception 'role/server mismatch';
  end if;
  insert into public.category_role_overrides (category_id, role_id, allow, deny)
  values (p_category, p_role, coalesce(p_allow, 0), coalesce(p_deny, 0))
  on conflict (category_id, role_id) do update
    set allow = excluded.allow, deny = excluded.deny;
end;
$$;
grant execute on function public.set_category_role_override(uuid, uuid, bigint, bigint) to authenticated;

create or replace function public.remove_category_role_override(p_category uuid, p_role uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_srv uuid;
begin
  select server_id into v_srv from public.server_categories where id = p_category;
  if v_srv is null then raise exception 'not found'; end if;
  if not public.has_perm(v_srv, 2) then raise exception 'forbidden'; end if;
  delete from public.category_role_overrides where category_id = p_category and role_id = p_role;
end;
$$;
grant execute on function public.remove_category_role_override(uuid, uuid) to authenticated;

-- Re-sync: drop all channel overrides and set the flag. Effective permissions
-- fall back to the category's overrides.
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

-- ── Effective per-channel permission mask (Discord-canonical order) ────────
create or replace function public.channel_perms(p_channel uuid, p_user uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  v_srv       uuid;
  v_cat       uuid;
  v_synced    boolean;
  v_owner     boolean;
  v_base      bigint := 0;
  v_role_ids  uuid[];
  v_default   uuid;
  v_ev_a      bigint;
  v_ev_d      bigint;
  v_agg_a     bigint;
  v_agg_d     bigint;
begin
  select sc.server_id, sc.category_id, sc.synced_to_category
    into v_srv, v_cat, v_synced
    from public.server_channels sc where sc.id = p_channel;
  if v_srv is null then return 0; end if;

  -- Owner short-circuits to all bits (kept in sync with server_perms owner).
  select (owner_id = p_user) into v_owner from public.servers where id = v_srv;
  if v_owner then return 4095::bigint; end if;

  select id into v_default from public.server_roles
    where server_id = v_srv and is_default limit 1;

  -- Roles applied to this user on this server (@everyone + assigned).
  v_role_ids := array(
    select r.id from public.server_roles r
    where r.server_id = v_srv
      and (r.is_default or r.id in (
        select mr.role_id from public.server_member_roles mr where mr.profile_id = p_user
      ))
  );

  -- Baseline server permissions from the union of the user's roles.
  select coalesce(bit_or(permissions), 0::bigint)
    into v_base
    from public.server_roles
    where id = any(v_role_ids);

  -- Category overrides come first when the channel has a parent category.
  if v_cat is not null then
    -- @everyone override for the category.
    select coalesce(allow, 0), coalesce(deny, 0) into v_ev_a, v_ev_d
      from public.category_role_overrides
      where category_id = v_cat and role_id = v_default;
    v_base := (v_base & ~coalesce(v_ev_d, 0)) | coalesce(v_ev_a, 0);

    -- Aggregated non-@everyone role overrides (deny first, allow wins).
    select coalesce(bit_or(allow), 0::bigint), coalesce(bit_or(deny), 0::bigint)
      into v_agg_a, v_agg_d
      from public.category_role_overrides
      where category_id = v_cat
        and role_id = any(v_role_ids)
        and role_id <> v_default;
    v_base := (v_base & ~coalesce(v_agg_d, 0)) | coalesce(v_agg_a, 0);
  end if;

  -- Channel overrides only when the channel is NOT synced to its category
  -- (or has no category to sync with).
  if v_cat is null or not v_synced then
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
  end if;

  return v_base;
end;
$$;
grant execute on function public.channel_perms(uuid, uuid) to authenticated;

-- ── Update get_server_channels to expose synced flag + my channel perms ────
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
    c.synced_to_category,
    public.channel_perms(c.id, auth.uid())
  from public.server_channels c
  join public.servers s on s.id = c.server_id
  left join public.server_categories cat on cat.id = c.category_id
  where c.server_id = p_server and public.is_server_member(p_server)
  order by coalesce(cat.position, 0) asc, c.position asc, c.created_at asc;
$$;
grant execute on function public.get_server_channels(uuid) to authenticated;

-- ── Channel message RPCs now gate on channel_perms (not server_perms) ──────
-- SEND_MESSAGES (16), USE_EMOJI (32), MANAGE_MESSAGES (64), READ_HISTORY (128),
-- ADD_REACTIONS (2048), CHANGE_THEME (1024) — all resolved per-channel now.

drop function if exists public.send_channel_message(uuid, text, uuid);
create or replace function public.send_channel_message(p_channel uuid, body text, reply uuid default null)
returns table (msg_id uuid, msg_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; cperms bigint; v_id uuid; v_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null or not public.is_server_member(srv) then raise exception 'forbidden'; end if;

  cperms := public.channel_perms(p_channel, me);
  if (cperms & 16) = 0 then raise exception 'forbidden'; end if;

  perform public.check_rate_limit('message', 15, 10);

  body := trim(body);
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;
  -- Stickers require USE_EMOJI on this channel.
  if body like 'sticker:%' and (cperms & 32) = 0 then raise exception 'forbidden'; end if;

  insert into public.channel_messages (channel_id, sender_id, content, reply_to)
  values (p_channel, me, body, reply)
  returning channel_messages.id, channel_messages.created_at into v_id, v_at;

  -- Mentions (server-wide; not gated per-channel).
  if body ~* '@everyone([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm where sm.server_id = srv and sm.profile_id <> me;
  elsif body ~* '@here([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm join public.profiles p on p.id = sm.profile_id
    where sm.server_id = srv and sm.profile_id <> me
      and p.last_seen is not null and p.last_seen > now() - interval '2 minutes';
  else
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm join public.profiles p on p.id = sm.profile_id
    where sm.server_id = srv and sm.profile_id <> me
      and lower(body) ~ ('@' || lower(p.username) || '([^a-z0-9_]|$)');
  end if;

  -- Role mentions (respect mention_mode).
  insert into public.notifications (user_id, type, actor_id, ref_id)
  select distinct mr.profile_id, 'mention', me, p_channel
  from public.server_roles r
  join public.server_member_roles mr on mr.role_id = r.id
  where r.server_id = srv
    and not r.is_default
    and r.name ~ '^[A-Za-z0-9_]+$'
    and lower(body) ~ ('@' || lower(r.name) || '([^a-z0-9_]|$)')
    and mr.profile_id <> me
    and (
      r.mention_mode = 'everyone'
      or (r.mention_mode = 'selected'
          and exists (select 1 from public.server_role_mention_allow a
                      where a.role_id = r.id and a.profile_id = me))
    );

  msg_id := v_id; msg_created_at := v_at; return next;
end;
$$;
grant execute on function public.send_channel_message(uuid, text, uuid) to authenticated;

-- delete_channel_message: author, MANAGE_MESSAGES on this channel, or owner.
create or replace function public.delete_channel_message(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_sender uuid; v_channel uuid; v_server uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select m.sender_id, m.channel_id, sc.server_id into v_sender, v_channel, v_server
  from public.channel_messages m
  join public.server_channels sc on sc.id = m.channel_id
  where m.id = p_message;
  if v_server is null then raise exception 'not found'; end if;
  if me <> v_sender and (public.channel_perms(v_channel, me) & 64) = 0 then
    raise exception 'forbidden';
  end if;
  delete from public.channel_messages where id = p_message;
end;
$$;
grant execute on function public.delete_channel_message(uuid) to authenticated;

-- get_channel_messages: READ_HISTORY on this channel.
drop function if exists public.get_channel_messages(uuid);
create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean,
  sender_role_color text, sender_role_color2 text, sender_role_glow text, sender_role_icon text)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.sender_id, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator,
    (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.color2 from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.glow from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.glow is not null
       order by r.position desc limit 1),
    (select r.icon_url from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.icon_url is not null
       order by r.position desc limit 1)
  from public.channel_messages m
  join public.profiles p on p.id = m.sender_id
  join public.server_channels sc on sc.id = m.channel_id
  where m.channel_id = p_channel
    and public.is_channel_member(p_channel)
    and (public.channel_perms(p_channel, auth.uid()) & 128) <> 0
  order by m.created_at asc
  limit 200;
$$;
grant execute on function public.get_channel_messages(uuid) to authenticated;

-- toggle_message_reaction: ADD_REACTIONS resolved per-channel (from migr. 82).
create or replace function public.toggle_message_reaction(p_message uuid, p_source text, p_emoji text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  already boolean;
  v_channel uuid;
  v_server  uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if p_source not in ('channel', 'dm') then raise exception 'invalid source'; end if;
  if char_length(trim(p_emoji)) < 1 then raise exception 'empty emoji'; end if;

  if p_source = 'channel' then
    select sc.id, sc.server_id into v_channel, v_server
      from public.channel_messages cm
      join public.server_channels sc on sc.id = cm.channel_id
      where cm.id = p_message;
    if v_server is null then raise exception 'not found'; end if;
    if not public.is_server_member(v_server) then raise exception 'forbidden'; end if;
    if (public.channel_perms(v_channel, me) & 2048) = 0 then raise exception 'no permission'; end if;
  else
    if not exists (
      select 1 from public.direct_messages dm
      join public.conversation_participants cp on cp.conversation_id = dm.conversation_id
      where dm.id = p_message and cp.profile_id = me
    ) then raise exception 'forbidden'; end if;
  end if;

  select count(*) > 0 into already
    from public.message_reactions
    where message_id = p_message and source = p_source and user_id = me and emoji = p_emoji;

  if already then
    delete from public.message_reactions
      where message_id = p_message and source = p_source and user_id = me and emoji = p_emoji;
    return false;
  else
    insert into public.message_reactions (message_id, source, user_id, emoji)
      values (p_message, p_source, me, p_emoji)
      on conflict do nothing;
    return true;
  end if;
end;
$$;
grant execute on function public.toggle_message_reaction(uuid, text, text) to authenticated;

-- set_channel_theme: CHANGE_THEME resolved per-channel.
create or replace function public.set_channel_theme(
  p_channel uuid, p_image text default null, p_dim real default null,
  p_x real default null, p_y real default null, p_all boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  -- Server-wide theme still requires the server-level permission (owner
  -- shortcut in server_perms), otherwise per-channel resolution.
  if p_all then
    if not public.has_perm(srv, 1024) then raise exception 'forbidden'; end if;
    update public.servers set
      theme_image = nullif(p_image, ''),
      theme_dim   = p_dim, theme_x = p_x, theme_y = p_y
    where id = srv;
  else
    if (public.channel_perms(p_channel, auth.uid()) & 1024) = 0 then raise exception 'forbidden'; end if;
    update public.server_channels set
      theme_image = nullif(p_image, ''),
      theme_dim   = p_dim, theme_x = p_x, theme_y = p_y
    where id = p_channel;
  end if;
end;
$$;
grant execute on function public.set_channel_theme(uuid, text, real, real, real, boolean) to authenticated;
