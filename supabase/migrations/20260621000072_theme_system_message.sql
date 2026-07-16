-- ─────────────────────────────────────────────────────────────────────────
-- Post a system message ("X changed the channel theme") whenever a channel
-- theme is set/removed, so it shows up inline in the chat like group events.
-- The marker content is `sys:theme`; the client renders it as a centred line.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.set_channel_theme(
  p_channel uuid, p_image text default null, p_dim real default null,
  p_x real default null, p_y real default null, p_all boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid; me uuid := auth.uid();
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1024) then raise exception 'forbidden'; end if;

  if p_all then
    update public.servers set
      theme_image = nullif(p_image, ''),
      theme_dim   = p_dim, theme_x = p_x, theme_y = p_y
    where id = srv;
  else
    update public.server_channels set
      theme_image = nullif(p_image, ''),
      theme_dim   = p_dim, theme_x = p_x, theme_y = p_y
    where id = p_channel;
  end if;

  insert into public.channel_messages (channel_id, sender_id, content)
  values (p_channel, me, 'sys:theme');
end;
$$;
grant execute on function public.set_channel_theme(uuid, text, real, real, real, boolean) to authenticated;
