-- Map of every channel in the caller's servers → its server public id.
-- Lets the icon rail attribute realtime channel messages to a server so it can
-- show an unread / mention indicator on the server avatar.
create or replace function public.get_my_channel_servers()
returns table(channel_id uuid, server_public_id text)
language sql stable security definer set search_path = public as $$
  select c.id, s.public_id::text
  from public.server_channels c
  join public.servers s on s.id = c.server_id
  join public.server_members sm on sm.server_id = s.id
  where sm.profile_id = auth.uid();
$$;
grant execute on function public.get_my_channel_servers() to authenticated;
