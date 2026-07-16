-- Owner-only deletion of channels and categories. Deleting a category keeps
-- its channels but detaches them (they fall back to "uncategorized").

create or replace function public.delete_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  if not exists (select 1 from public.servers where id = srv and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  delete from public.server_channels where id = p_channel;
end;
$$;
grant execute on function public.delete_channel(uuid) to authenticated;

create or replace function public.delete_category(p_category uuid)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select cat.server_id into srv from public.server_categories cat where cat.id = p_category;
  if srv is null then raise exception 'not found'; end if;
  if not exists (select 1 from public.servers where id = srv and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  -- Detach channels first so they aren't cascade-deleted.
  update public.server_channels set category_id = null where category_id = p_category;
  delete from public.server_categories where id = p_category;
end;
$$;
grant execute on function public.delete_category(uuid) to authenticated;
