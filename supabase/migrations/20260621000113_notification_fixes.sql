-- ─────────────────────────────────────────────────────────────────────────
-- Notification round-2 fixes + per-server notification settings.
--
--   1. ensure_dm — a freshly opened (empty) DM must NOT appear in either user's
--      list. Create both participant rows HIDDEN; send_dm already unhides on the
--      first message. The chat stays reachable by URL, just not listed.
--   2. mark_channel_read — also mark this channel's unread "mention"
--      notifications as read, so get_channel_unreads.mention_count drops to 0
--      and the channel stops glowing after you view it.
--   3. server_notify_settings — per-(user,server) notification preferences:
--      level (all/mentions/nothing), suppress @everyone/@here, suppress role
--      mentions, and a mute-until timestamp. Honoured when creating channel
--      mention notifications and (client-side) for sound/toast/push + badges.
--   4. mark_server_read — "read all" for a whole server.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. ensure_dm: create empty conversations hidden for BOTH participants ──
create or replace function public.ensure_dm(other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if other is null or other = me then raise exception 'invalid target'; end if;

  select public.find_dm_conversation(me, other) into conv;

  if conv is null then
    conv := gen_random_uuid();
    insert into public.conversations(id, is_group) values (conv, false);
    -- Hidden until the first message (send_dm unhides). Opening a chat and
    -- writing nothing must not surface it in either user's DM list.
    insert into public.conversation_participants(conversation_id, profile_id, hidden)
      values (conv, me, true), (conv, other, true);
  else
    -- Reopening my own side: keep it visible for me (I'm actively opening it),
    -- but don't force it back onto the other person if they dismissed it.
    update public.conversation_participants
      set hidden = false
      where conversation_id = conv and profile_id = me;
  end if;

  return conv;
end;
$$;

-- ── 2. mark_channel_read: also clear this channel's mention notifications ──
create or replace function public.mark_channel_read(p_channel uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  ts     timestamptz := now();
  last_m uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not public.is_channel_member(p_channel) then raise exception 'forbidden'; end if;

  select id into last_m
  from public.channel_messages
  where channel_id = p_channel
  order by created_at desc
  limit 1;

  insert into public.channel_reads (profile_id, channel_id, last_read_at, last_read_message_id)
  values (me, p_channel, ts, last_m)
  on conflict (profile_id, channel_id) do update
    set last_read_at = ts, last_read_message_id = last_m;

  -- Clear the bell's channel mentions so the channel stops glowing once viewed.
  update public.notifications
  set read = true
  where user_id = me and type = 'mention' and ref_id = p_channel and read = false;

  return ts;
end;
$$;
grant execute on function public.mark_channel_read(uuid) to authenticated;

-- ── 3. Per-server notification settings ─────────────────────────────────────
create table if not exists public.server_notify_settings (
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  server_id         uuid not null references public.servers(id) on delete cascade,
  -- 'all' = every message pings, 'mentions' = only @/role mentions, 'nothing'.
  level             text not null default 'all' check (level in ('all','mentions','nothing')),
  suppress_everyone boolean not null default false,   -- ignore @everyone / @here
  suppress_roles    boolean not null default false,   -- ignore role mentions
  muted_until       timestamptz,                       -- null = not muted; far future = until un-muted
  primary key (profile_id, server_id)
);

alter table public.server_notify_settings enable row level security;

-- Realtime so a change on one device reflects on the rail elsewhere.
alter table public.server_notify_settings replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.server_notify_settings;
  exception when duplicate_object then null;
  end;
end $$;

drop policy if exists "Own server notify settings" on public.server_notify_settings;
create policy "Own server notify settings"
  on public.server_notify_settings for select using (auth.uid() = profile_id);

-- True when a mute is active right now.
create or replace function public.server_is_muted(p_server uuid, p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.server_notify_settings s
    where s.profile_id = p_profile and s.server_id = p_server
      and s.muted_until is not null and s.muted_until > now()
  );
$$;

-- Save (upsert) my settings for a server.
create or replace function public.set_server_notify_settings(
  p_server uuid,
  p_level text default null,
  p_suppress_everyone boolean default null,
  p_suppress_roles boolean default null,
  p_muted_until timestamptz default null,
  p_clear_mute boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not public.is_server_member(p_server) then raise exception 'forbidden'; end if;

  insert into public.server_notify_settings (profile_id, server_id, level,
      suppress_everyone, suppress_roles, muted_until)
  values (me, p_server, coalesce(p_level, 'all'),
      coalesce(p_suppress_everyone, false), coalesce(p_suppress_roles, false),
      case when p_clear_mute then null else p_muted_until end)
  on conflict (profile_id, server_id) do update set
    level             = coalesce(p_level, server_notify_settings.level),
    suppress_everyone = coalesce(p_suppress_everyone, server_notify_settings.suppress_everyone),
    suppress_roles    = coalesce(p_suppress_roles, server_notify_settings.suppress_roles),
    muted_until       = case when p_clear_mute then null
                             when p_muted_until is not null then p_muted_until
                             else server_notify_settings.muted_until end;
end;
$$;
grant execute on function public.set_server_notify_settings(uuid, text, boolean, boolean, timestamptz, boolean) to authenticated;

-- Read my settings for the servers I'm in (rail reads all at once).
create or replace function public.get_my_server_notify()
returns table(server_id uuid, level text, suppress_everyone boolean,
  suppress_roles boolean, muted_until timestamptz)
language sql stable security definer set search_path = public as $$
  select s.server_id, s.level, s.suppress_everyone, s.suppress_roles, s.muted_until
  from public.server_notify_settings s
  where s.profile_id = auth.uid();
$$;
grant execute on function public.get_my_server_notify() to authenticated;

-- ── 4. mark_server_read — "read all" for a whole server ─────────────────────
create or replace function public.mark_server_read(p_server uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ts timestamptz := now();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not public.is_server_member(p_server) then raise exception 'forbidden'; end if;

  -- Advance read state for every channel the user can see in this server.
  insert into public.channel_reads (profile_id, channel_id, last_read_at, last_read_message_id)
  select me, sc.id, ts,
    (select cm.id from public.channel_messages cm where cm.channel_id = sc.id
       order by cm.created_at desc limit 1)
  from public.server_channels sc
  where sc.server_id = p_server
    and (public.channel_perms(sc.id, me) & 128) <> 0
  on conflict (profile_id, channel_id) do update
    set last_read_at = ts, last_read_message_id = excluded.last_read_message_id;

  -- Clear all of this server's channel mentions from the bell.
  update public.notifications n
  set read = true
  where n.user_id = me and n.type = 'mention' and n.read = false
    and n.ref_id in (select sc.id from public.server_channels sc where sc.server_id = p_server);
end;
$$;
grant execute on function public.mark_server_read(uuid) to authenticated;

-- ── send_channel_message: honour each recipient's server notify settings ────
-- (latest def from 20260621000111 + a per-recipient filter). A member is
-- eligible for a mention notification only when, for this server, their
-- settings don't mute/silence it:
--   level = 'nothing'                          → never
--   muted_until active                         → never
--   @everyone/@here with suppress_everyone     → skip
--   role mention with suppress_roles           → skip
-- (level 'mentions' vs 'all' governs SOUND/badge on the client; a direct
-- @username/@role always creates the notification unless suppressed above.)
drop function if exists public.send_channel_message(uuid, text, uuid);
create or replace function public.send_channel_message(p_channel uuid, body text, reply uuid default null)
returns table (msg_id uuid, msg_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; cperms bigint; v_id uuid; v_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null or not public.is_server_member(srv) then raise exception 'forbidden'; end if;

  if exists (
    select 1 from public.server_members sm
    where sm.server_id = srv and sm.profile_id = me
      and sm.timeout_until is not null and sm.timeout_until > now()
  ) then raise exception 'timed_out'; end if;

  cperms := public.channel_perms(p_channel, me);
  if (cperms & 16) = 0 then raise exception 'forbidden'; end if;

  perform public.check_rate_limit('message', 15, 10);

  body := trim(body);
  if body = '' or char_length(body) > public.message_char_limit(me) then raise exception 'invalid content'; end if;
  if body like 'sticker:%' and (cperms & 32) = 0 then raise exception 'forbidden'; end if;

  insert into public.channel_messages (channel_id, sender_id, content, reply_to)
  values (p_channel, me, body, reply)
  returning channel_messages.id, channel_messages.created_at into v_id, v_at;

  -- Notification eligibility per member for THIS server (settings-aware).
  -- ok_base: not silenced/muted. everyone_ok / roles_ok: category not suppressed.
  -- @everyone / @here.
  if body ~* '@everyone([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id, message_id)
    select sm.profile_id, 'mention', me, p_channel, v_id
    from public.server_members sm
    left join public.server_notify_settings ns
      on ns.profile_id = sm.profile_id and ns.server_id = srv
    where sm.server_id = srv and sm.profile_id <> me
      and coalesce(ns.level, 'all') <> 'nothing'
      and not (ns.muted_until is not null and ns.muted_until > now())
      and not coalesce(ns.suppress_everyone, false);
  elsif body ~* '@here([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id, message_id)
    select sm.profile_id, 'mention', me, p_channel, v_id
    from public.server_members sm
    join public.profiles p on p.id = sm.profile_id
    left join public.server_notify_settings ns
      on ns.profile_id = sm.profile_id and ns.server_id = srv
    where sm.server_id = srv and sm.profile_id <> me
      and p.last_seen is not null and p.last_seen > now() - interval '2 minutes'
      and coalesce(ns.level, 'all') <> 'nothing'
      and not (ns.muted_until is not null and ns.muted_until > now())
      and not coalesce(ns.suppress_everyone, false);
  else
    -- @username — a direct ping; only level='nothing' / mute suppress it.
    insert into public.notifications (user_id, type, actor_id, ref_id, message_id)
    select sm.profile_id, 'mention', me, p_channel, v_id
    from public.server_members sm
    join public.profiles p on p.id = sm.profile_id
    left join public.server_notify_settings ns
      on ns.profile_id = sm.profile_id and ns.server_id = srv
    where sm.server_id = srv and sm.profile_id <> me
      and lower(body) ~ ('@' || lower(p.username) || '([^a-z0-9_]|$)')
      and coalesce(ns.level, 'all') <> 'nothing'
      and not (ns.muted_until is not null and ns.muted_until > now());
  end if;

  -- Role mentions (respect mention_mode + suppress_roles / level / mute).
  insert into public.notifications (user_id, type, actor_id, ref_id, message_id)
  select distinct mr.profile_id, 'mention', me, p_channel, v_id
  from public.server_roles r
  join public.server_member_roles mr on mr.role_id = r.id
  left join public.server_notify_settings ns
    on ns.profile_id = mr.profile_id and ns.server_id = srv
  where r.server_id = srv
    and not r.is_default
    and r.name ~ '^[A-Za-z0-9_]+$'
    and lower(body) ~ ('@' || lower(r.name) || '([^a-z0-9_]|$)')
    and mr.profile_id <> me
    and coalesce(ns.level, 'all') <> 'nothing'
    and not (ns.muted_until is not null and ns.muted_until > now())
    and not coalesce(ns.suppress_roles, false)
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

notify pgrst, 'reload schema';
