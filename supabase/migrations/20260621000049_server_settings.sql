-- Kick a member + allow clearing icon/banner (empty string = clear).

create or replace function public.remove_member(p_server uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_member = auth.uid() then raise exception 'cannot remove self'; end if;
  if exists (select 1 from public.servers where id = p_server and owner_id = p_member) then
    raise exception 'cannot remove owner';
  end if;
  delete from public.server_members where server_id = p_server and profile_id = p_member;
end;
$$;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- update_server: '' clears icon/banner; NULL keeps; value sets.
drop function if exists public.update_server(uuid, text, text, text);
create or replace function public.update_server(p_server uuid, p_name text default null, p_icon text default null, p_banner text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.servers set
    name = coalesce(nullif(trim(coalesce(p_name,'')),''), name),
    icon_url = case when p_icon = '' then null when p_icon is not null then p_icon else icon_url end,
    banner_url = case when p_banner = '' then null when p_banner is not null then p_banner else banner_url end
  where id = p_server;
end;
$$;
grant execute on function public.update_server(uuid, text, text, text) to authenticated;
