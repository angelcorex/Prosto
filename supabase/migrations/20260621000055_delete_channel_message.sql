-- Delete a channel message: allowed for its author or the server owner.
create or replace function public.delete_channel_message(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_sender uuid; v_server uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select m.sender_id, sc.server_id into v_sender, v_server
  from public.channel_messages m
  join public.server_channels sc on sc.id = m.channel_id
  where m.id = p_message;
  if v_server is null then raise exception 'not found'; end if;
  if me <> v_sender and not exists (
    select 1 from public.servers where id = v_server and owner_id = me
  ) then
    raise exception 'forbidden';
  end if;
  delete from public.channel_messages where id = p_message;
end;
$$;
grant execute on function public.delete_channel_message(uuid) to authenticated;
