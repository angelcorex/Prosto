-- Leave / delete a group conversation.

-- Any member can leave a group (a system "left" message is recorded).
create or replace function public.leave_group(conv uuid)
returns void
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  uname text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = conv and profile_id = me) then
    raise exception 'not a participant';
  end if;

  select username into uname from public.profiles where id = me;
  insert into public.direct_messages(conversation_id, sender_id, content, type)
  values (conv, me, 'group_leave:' || coalesce(uname, ''), 'system');

  delete from public.conversation_participants where conversation_id = conv and profile_id = me;
end;
$$;

-- Only the owner can delete a group (cascades to participants + messages).
create or replace function public.delete_group(conv uuid)
returns void
language plpgsql
security definer
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.conversations where id = conv and is_group and owner_id = me) then
    raise exception 'not owner';
  end if;
  delete from public.conversations where id = conv;
end;
$$;
