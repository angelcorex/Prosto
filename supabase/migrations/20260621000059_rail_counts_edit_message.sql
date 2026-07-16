-- Member/online counts for the rail hover tooltip + editing channel messages.

drop function if exists public.get_my_servers();
create or replace function public.get_my_servers()
returns table(id uuid, public_id text, name text, icon_url text, is_verified boolean,
  member_count int, online_count int)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.is_verified,
    (select count(*)::int from public.server_members m where m.server_id = s.id),
    (select count(*)::int from public.server_members m
       join public.profiles pp on pp.id = m.profile_id
       where m.server_id = s.id and pp.last_seen is not null
         and pp.last_seen > now() - interval '5 minutes')
  from public.servers s
  join public.server_members sm on sm.server_id = s.id
  where sm.profile_id = auth.uid()
  order by s.created_at asc;
$$;
grant execute on function public.get_my_servers() to authenticated;

-- Edit a channel message (author only).
create or replace function public.edit_channel_message(p_message uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_sender uuid; body text := trim(p_body);
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;
  select sender_id into v_sender from public.channel_messages where id = p_message;
  if v_sender is null then raise exception 'not found'; end if;
  if v_sender <> me then raise exception 'forbidden'; end if;
  update public.channel_messages set content = body where id = p_message;
end;
$$;
grant execute on function public.edit_channel_message(uuid, text) to authenticated;
