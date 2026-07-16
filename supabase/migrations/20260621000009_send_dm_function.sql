-- Single round-trip message send: insert + unhide + notify in one DB call.
-- Uses auth.uid() internally so the server action doesn't need a separate
-- getUser() round-trip to the auth server.
create or replace function public.send_dm(conv_id uuid, body text)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
as $$
declare
  me     uuid := auth.uid();
  new_id uuid;
  new_at timestamptz;
begin
  if me is null then
    raise exception 'unauthenticated';
  end if;

  -- Must be a participant
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and profile_id = me
  ) then
    raise exception 'not a participant';
  end if;

  body := trim(body);
  if body = '' or char_length(body) > 2000 then
    raise exception 'invalid content';
  end if;

  -- Insert message
  insert into public.direct_messages (conversation_id, sender_id, content)
  values (conv_id, me, body)
  returning direct_messages.id, direct_messages.created_at
  into new_id, new_at;

  -- Unhide for everyone in the conversation
  update public.conversation_participants
  set hidden = false
  where conversation_id = conv_id;

  -- Notify the other participants
  insert into public.notifications (user_id, type, actor_id, ref_id)
  select profile_id, 'message', me, conv_id
  from public.conversation_participants
  where conversation_id = conv_id and profile_id <> me;

  return query select new_id, new_at;
end;
$$;
