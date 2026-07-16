-- ─────────────────────────────────────────────────────────────────────────
-- Super Prosto perk: raise the message length limit from 2000 to 4000 chars
-- for subscribers. Free users stay at 2000. Enforced server-side in the send
-- RPCs (per-sender, by is_premium) and relaxed in the table CHECK constraints
-- (the RPC is the real gate; the table just needs to allow up to 4000).
-- ─────────────────────────────────────────────────────────────────────────

-- Per-user cap helper — 4000 for Super Prosto, else 2000.
create or replace function public.message_char_limit(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select is_premium from public.profiles where id = p_user), false) then 4000
    else 2000
  end;
$$;

-- Relax the table CHECKs to the premium ceiling (4000). The per-user 2000/4000
-- limit is enforced in the send RPCs below.
alter table public.direct_messages  drop constraint if exists direct_messages_content_check;
alter table public.direct_messages  add  constraint direct_messages_content_check  check (char_length(content) between 1 and 4000);
alter table public.channel_messages drop constraint if exists channel_messages_content_check;
alter table public.channel_messages add  constraint channel_messages_content_check check (char_length(content) between 1 and 4000);

-- ── send_channel_message (premium-aware length) — latest def from 20260621000083 ──
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
  if body = '' or char_length(body) > public.message_char_limit(me) then raise exception 'invalid content'; end if;
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

-- ── send_dm (premium-aware length) — latest def from 20260621000043 ──
drop function if exists public.send_dm(uuid, text, uuid);
create or replace function public.send_dm(conv_id uuid, body text, reply uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  new_id uuid;
  new_at timestamptz;
  is_grp boolean := false;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  perform public.check_rate_limit('message', 15, 10);

  if not exists (select 1 from public.conversation_participants where conversation_id = conv_id and profile_id = me) then
    raise exception 'not a participant';
  end if;

  select coalesce(c.is_group, false) into is_grp from public.conversations c where c.id = conv_id;

  if not is_grp and exists (
    select 1
    from public.conversation_participants cp
    join public.blocks b
      on (b.blocker_id = me and b.blocked_id = cp.profile_id)
      or (b.blocker_id = cp.profile_id and b.blocked_id = me)
    where cp.conversation_id = conv_id and cp.profile_id <> me
  ) then
    raise exception 'blocked';
  end if;

  body := trim(body);
  if body = '' or char_length(body) > public.message_char_limit(me) then raise exception 'invalid content'; end if;

  insert into public.direct_messages (conversation_id, sender_id, content, reply_to)
  values (conv_id, me, body, reply)
  returning direct_messages.id, direct_messages.created_at into new_id, new_at;

  update public.conversation_participants set hidden = false where conversation_id = conv_id;

  -- Plain "message" notification (DM list lights up; not the bell). Others only.
  insert into public.notifications (user_id, type, actor_id, ref_id)
  select profile_id, 'message', me, conv_id
  from public.conversation_participants
  where conversation_id = conv_id and profile_id <> me;

  -- Mentions → "mention" notification (bell badge). Never notify the sender.
  if body ~* '@everyone([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select profile_id, 'mention', me, conv_id
    from public.conversation_participants
    where conversation_id = conv_id and profile_id <> me;

  elsif body ~* '@here([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select cp.profile_id, 'mention', me, conv_id
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.profile_id
    where cp.conversation_id = conv_id
      and cp.profile_id <> me
      and p.last_seen is not null
      and p.last_seen > now() - interval '2 minutes';

  else
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select cp.profile_id, 'mention', me, conv_id
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.profile_id
    where cp.conversation_id = conv_id
      and cp.profile_id <> me
      and lower(body) ~ ('@' || lower(p.username) || '([^a-z0-9_]|$)');
  end if;

  -- Reply ping → mention for the replied-to message's author.
  if reply is not null then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select dm.sender_id, 'mention', me, conv_id
    from public.direct_messages dm
    where dm.id = reply and dm.sender_id <> me;
  end if;

  return query select new_id, new_at;
end;
$$;
grant execute on function public.send_dm(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
