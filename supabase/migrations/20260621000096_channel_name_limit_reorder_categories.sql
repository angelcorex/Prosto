-- ─────────────────────────────────────────────────────────────────────────
-- 1. Cap channel & category names at 20 characters (was effectively 60).
--    The RPCs are the real gate — the table CHECK still allows up to 60, and
--    20 < 60, so no data migration or constraint change is needed. Names are
--    stored verbatim now (the client no longer forces channel names to
--    lowercase-with-dashes — spaces are kept, just like categories).
--
-- 2. reorder_categories: drag-to-reorder categories in the sidebar (mirrors
--    reorder_channels). Gated on MANAGE_CHANNELS (bit 1), same as channels.
-- ─────────────────────────────────────────────────────────────────────────

-- ── create_channel (+ 20-char limit) — latest def from 20260621000066 ──
create or replace function public.create_channel(p_server uuid, p_name text, p_category uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if not public.has_perm(p_server, 1) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 20 then raise exception 'invalid name'; end if;
  insert into public.server_channels (server_id, category_id, name)
  values (p_server, p_category, trim(p_name)) returning public_id::text into pid;
  return pid;
end;
$$;
grant execute on function public.create_channel(uuid, text, uuid) to authenticated;

-- ── create_category (+ 20-char limit) — latest def from 20260621000066 ──
create or replace function public.create_category(p_server uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 1) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 20 then raise exception 'invalid name'; end if;
  insert into public.server_categories (server_id, name, position)
  values (p_server, trim(p_name),
    coalesce((select max(position)+1 from public.server_categories where server_id = p_server), 1));
end;
$$;
grant execute on function public.create_category(uuid, text) to authenticated;

-- ── update_channel (20-char limit, was 60) — latest def from 20260621000066 ──
create or replace function public.update_channel(p_channel uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 20 then raise exception 'invalid name'; end if;
  update public.server_channels set name = trim(p_name) where id = p_channel;
end;
$$;
grant execute on function public.update_channel(uuid, text) to authenticated;

-- ── update_category (20-char limit, was 60) — latest def from 20260621000066 ──
create or replace function public.update_category(p_category uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select cat.server_id into srv from public.server_categories cat where cat.id = p_category;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 1) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 20 then raise exception 'invalid name'; end if;
  update public.server_categories set name = trim(p_name) where id = p_category;
end;
$$;
grant execute on function public.update_category(uuid, text) to authenticated;

-- ── reorder_categories: drag-to-reorder categories (MANAGE_CHANNELS = bit 1) ──
create or replace function public.reorder_categories(p_server uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if not public.has_perm(p_server, 1) then raise exception 'forbidden'; end if;
  for it in select * from jsonb_array_elements(p_items)
  loop
    update public.server_categories
      set position = coalesce((it->>'position')::int, position)
    where id = (it->>'id')::uuid and server_id = p_server;
  end loop;
end;
$$;
grant execute on function public.reorder_categories(uuid, jsonb) to authenticated;

-- Refresh PostgREST's schema cache so the new/updated RPCs resolve immediately.
notify pgrst, 'reload schema';
