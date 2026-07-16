-- Return all categories of a server (so empty categories — those with no
-- channels yet — still show up in the sidebar).
create or replace function public.get_server_categories(p_server uuid)
returns table(id uuid, name text, pos int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.position
  from public.server_categories c
  where c.server_id = p_server and public.is_server_member(p_server)
  order by c.position asc, c.created_at asc;
$$;

grant execute on function public.get_server_categories(uuid) to authenticated;
