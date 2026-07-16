-- ─────────────────────────────────────────────────────────────────────────
-- Discord-style per-channel read state + jump-to-message pings.
--
-- Until now server-channel "unread" lived only in the ServerRail's memory: it
-- was seeded from realtime INSERTs while the page was open, reset on reload,
-- didn't remember which channel, and couldn't jump to the pinging message.
--
-- This adds:
--   • channel_reads — a per-(user,channel) last_read_at + last_read_message_id,
--     the persistent source of truth (survives reloads, like DM last_read_at).
--   • mark_channel_read / get_channel_unreads — advance + read the state.
--   • notifications.message_id — so a mention notification can jump straight to
--     the message (ref_id already carries the channel).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.channel_reads (
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  channel_id           uuid not null references public.server_channels(id) on delete cascade,
  last_read_at         timestamptz not null default now(),
  last_read_message_id uuid,
  primary key (profile_id, channel_id)
);

alter table public.channel_reads enable row level security;

-- A user only ever sees / writes their own read rows.
drop policy if exists "Own channel reads" on public.channel_reads;
create policy "Own channel reads"
  on public.channel_reads for select using (auth.uid() = profile_id);

-- Realtime so reading on one device clears the badge on the user's others.
alter table public.channel_reads replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.channel_reads;
  exception when duplicate_object then null;
  end;
end $$;

-- Jump-to-message target for channel mentions (ref_id stays the channel id).
alter table public.notifications
  add column if not exists message_id uuid;

-- ── Mark a channel read (advance to the latest message the caller can see) ──
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
  return ts;
end;
$$;
grant execute on function public.mark_channel_read(uuid) to authenticated;

-- ── Per-channel unread + mention counts for all the caller's channels ──
-- unread_count  = messages from others newer than my last_read_at
-- mention_count = "mention" notifications for me in this channel, still unread
-- Returns the server public_id too so the rail can aggregate per server.
create or replace function public.get_channel_unreads()
returns table(
  channel_id        uuid,
  channel_public_id text,
  server_public_id  text,
  unread_count      int,
  mention_count     int
)
language sql stable security definer set search_path = public as $$
  with my_channels as (
    select sc.id as channel_id, sc.public_id as channel_public_id,
           s.public_id as server_public_id
    from public.server_channels sc
    join public.servers s on s.id = sc.server_id
    join public.server_members sm on sm.server_id = s.id and sm.profile_id = auth.uid()
    where (public.channel_perms(sc.id, auth.uid()) & 128) <> 0  -- READ_HISTORY
  )
  select
    mc.channel_id,
    mc.channel_public_id::text,
    mc.server_public_id::text,
    (
      select count(*) from public.channel_messages m
      where m.channel_id = mc.channel_id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(
          (select cr.last_read_at from public.channel_reads cr
           where cr.profile_id = auth.uid() and cr.channel_id = mc.channel_id),
          'epoch'::timestamptz)
    )::int as unread_count,
    (
      select count(*) from public.notifications n
      where n.user_id = auth.uid()
        and n.type = 'mention'
        and n.ref_id = mc.channel_id
        and n.read = false
    )::int as mention_count
  from my_channels mc;
$$;
grant execute on function public.get_channel_unreads() to authenticated;

-- ── Re-assert send_channel_message so mention notifications carry message_id ──
-- (latest def from 20260621000099 + message_id on every mention insert, for
-- jump-to-message). Behaviour is otherwise identical.
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

  -- Mentions (server-wide; not gated per-channel). ref_id = channel, message_id
  -- = this message, so the notification can jump straight to it.
  if body ~* '@everyone([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id, message_id)
    select sm.profile_id, 'mention', me, p_channel, v_id
    from public.server_members sm where sm.server_id = srv and sm.profile_id <> me;
  elsif body ~* '@here([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id, message_id)
    select sm.profile_id, 'mention', me, p_channel, v_id
    from public.server_members sm join public.profiles p on p.id = sm.profile_id
    where sm.server_id = srv and sm.profile_id <> me
      and p.last_seen is not null and p.last_seen > now() - interval '2 minutes';
  else
    insert into public.notifications (user_id, type, actor_id, ref_id, message_id)
    select sm.profile_id, 'mention', me, p_channel, v_id
    from public.server_members sm join public.profiles p on p.id = sm.profile_id
    where sm.server_id = srv and sm.profile_id <> me
      and lower(body) ~ ('@' || lower(p.username) || '([^a-z0-9_]|$)');
  end if;

  -- Role mentions (respect mention_mode).
  insert into public.notifications (user_id, type, actor_id, ref_id, message_id)
  select distinct mr.profile_id, 'mention', me, p_channel, v_id
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

notify pgrst, 'reload schema';
