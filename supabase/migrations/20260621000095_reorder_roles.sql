-- ─────────────────────────────────────────────────────────────────────────
-- Drag-to-reorder for server roles (mirrors reorder_channels from migr. 66).
--
-- The role list is ordered by `position` DESC (highest role on top), so the
-- client sends the new position for each moved role. Requires MANAGE_ROLES
-- (bit 2) — the same gate as every other role-management RPC. The default
-- '@everyone' role is pinned at the bottom (position 0) and is never moved,
-- even if the client tries to include it in the batch.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.reorder_roles(p_server uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if not public.has_perm(p_server, 2) then raise exception 'forbidden'; end if;
  for it in select * from jsonb_array_elements(p_items)
  loop
    update public.server_roles
      set position = coalesce((it->>'position')::int, position)
    where id = (it->>'id')::uuid
      and server_id = p_server
      and not is_default;
  end loop;
end;
$$;
grant execute on function public.reorder_roles(uuid, jsonb) to authenticated;

-- Refresh PostgREST's schema cache so the new RPC resolves immediately.
notify pgrst, 'reload schema';
