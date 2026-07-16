-- Kick a member from a group (owner only) with a system message.
create or replace function public.remove_group_member(conv uuid, target uuid)
returns void
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  uname text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.conversations where id = conv and is_group and owner_id = me) then
    raise exception 'not owner';
  end if;
  if target = me then raise exception 'cannot kick self'; end if;

  select username into uname from public.profiles where id = target;

  insert into public.direct_messages(conversation_id, sender_id, content, type)
  values (conv, me, 'group_kick:' || coalesce(uname, ''), 'system');

  delete from public.conversation_participants where conversation_id = conv and profile_id = target;
end;
$$;
