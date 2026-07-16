-- Reply pings: replying to someone's message notifies them as a "mention",
-- which shows up in the bell badge (unlike plain 'message' notifications).
-- Re-asserts send_dm so it's self-contained regardless of apply order.

-- Allow the new 'mention' notification type.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('follow','friend_request','friend_accepted','message','mention'));

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

  -- Hard anti-spam ceiling: 15 messages / 10s per user across all chats.
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

  insert into public.notifications (user_id, type, actor_id, ref_id)
  select profile_id, 'message', me, conv_id
  from public.conversation_participants
  where conversation_id = conv_id and profile_id <> me;

  -- Reply ping → 'mention' notification for the replied-to message's author.
  if reply is not null then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select dm.sender_id, 'mention', me, conv_id
    from public.direct_messages dm
    where dm.id = reply
      and dm.sender_id <> me;
  end if;

  return query select new_id, new_at;
end;
$$;
