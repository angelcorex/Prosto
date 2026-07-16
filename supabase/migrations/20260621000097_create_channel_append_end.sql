-- ─────────────────────────────────────────────────────────────────────────
-- Fix: new channels must be appended to the END of their category.
--
-- migration 54 appended new channels (position = max+1), but migration 66
-- rewrote create_channel to add the MANAGE_CHANNELS gate and accidentally
-- dropped the position logic — so new channels inherit position 0 and jump to
-- the TOP of the category. This restores the append-at-end behaviour on top of
-- the current (20-char-limit) definition from migration 96.
--
-- `category_id is not distinct from p_category` groups by category with NULL
-- treated as a value, so uncategorized channels get their own running order.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.create_channel(p_server uuid, p_name text, p_category uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare pid text; next_pos int;
begin
  if not public.has_perm(p_server, 1) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 20 then raise exception 'invalid name'; end if;

  select coalesce(max(position) + 1, 0) into next_pos
  from public.server_channels
  where server_id = p_server and category_id is not distinct from p_category;

  insert into public.server_channels (server_id, category_id, name, position)
  values (p_server, p_category, trim(p_name), next_pos)
  returning public_id::text into pid;
  return pid;
end;
$$;
grant execute on function public.create_channel(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
