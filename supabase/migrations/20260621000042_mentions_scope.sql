-- Refine mention scope:
--   @everyone → every participant, INCLUDING the sender
--   @here     → only participants currently in the app (recent last_seen)
--   @username → that participant
-- (Supersedes the mention block from migration 41.)

drop function if exists public.send_dm(uuid, text, uuid);
create or replace function public.send_dm(conv_id uuid, body text, reply uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
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
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;

  insert into public.direct_messages (conversation_id, sender_id, content, reply_to)
  values (conv_id, me, body, reply)
  returning direct_messages.id, direct_messages.created_at into new_id, new_at;

  update public.conversation_participants set hidden = false where conversation_id = conv_id;

  -- Plain "message" notification (DM list lights up; not the bell). Others only.
  insert into public.notifications (user_id, type, actor_id, ref_id)
  select profile_id, 'message', me, conv_id
  from public.conversation_participants
  where conversation_id = conv_id and profile_id <> me;

  -- Mentions → "mention" notification (bell badge).
  if body ~* '@everyone([^a-z0-9_]|$)' then
    -- Everyone, including the sender.
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select profile_id, 'mention', me, conv_id
    from public.conversation_participants
    where conversation_id = conv_id;

  elsif body ~* '@here([^a-z0-9_]|$)' then
    -- Only members currently in the app (recent presence heartbeat).
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select cp.profile_id, 'mention', me, conv_id
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.profile_id
    where cp.conversation_id = conv_id
      and p.last_seen is not null
      and p.last_seen > now() - interval '2 minutes';

  else
    -- @username pings.
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
