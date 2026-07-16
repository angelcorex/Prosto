-- Owner-only: rename channels/categories and reorder channels (incl. moving
-- them between categories via drag & drop).

create or replace function public.update_channel(p_channel uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  if not exists (select 1 from public.servers where id = srv and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 60 then raise exception 'invalid name'; end if;
  update public.server_channels set name = trim(p_name) where id = p_channel;
end;
$$;
grant execute on function public.update_channel(uuid, text) to authenticated;

create or replace function public.update_category(p_category uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select cat.server_id into srv from public.server_categories cat where cat.id = p_category;
  if srv is null then raise exception 'not found'; end if;
  if not exists (select 1 from public.servers where id = srv and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 60 then raise exception 'invalid name'; end if;
  update public.server_categories set name = trim(p_name) where id = p_category;
end;
$$;
grant execute on function public.update_category(uuid, text) to authenticated;

-- Batch reorder: each item is { id, category_id, position }. category_id may be
-- null/'' for "uncategorized". Only channels of p_server are touched.
create or replace function public.reorder_channels(p_server uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if not exists (select 1 from public.servers where id = p_server and owner_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  for it in select * from jsonb_array_elements(p_items)
  loop
    update public.server_channels
      set category_id = nullif(it->>'category_id','')::uuid,
          position    = coalesce((it->>'position')::int, 0)
    where id = (it->>'id')::uuid and server_id = p_server;
  end loop;
end;
$$;
grant execute on function public.reorder_channels(uuid, jsonb) to authenticated;
