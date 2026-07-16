-- ─────────────────────────────────────────────────────────────────────────
-- Per-user server organisation: manual sort order, pinning, and folders.
-- Everything is stored per-member (each user arranges their own rail).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.server_folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text,
  color      text,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists server_folders_owner_idx on public.server_folders (owner_id, position);
alter table public.server_folders enable row level security;
drop policy if exists "folders: owner all" on public.server_folders;
create policy "folders: owner all" on public.server_folders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.server_members add column if not exists sort_pos int not null default 0;
alter table public.server_members add column if not exists pinned   boolean not null default false;
alter table public.server_members add column if not exists folder_id uuid references public.server_folders(id) on delete set null;

-- ── get_my_servers → include per-user order / pin / folder ──
drop function if exists public.get_my_servers();
create or replace function public.get_my_servers()
returns table(id uuid, public_id text, name text, icon_url text, is_verified boolean,
  member_count int, online_count int, sort_pos int, pinned boolean, folder_id uuid)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.is_verified,
    (select count(*)::int from public.server_members m2 where m2.server_id = s.id),
    (select count(*)::int from public.server_members m3
       join public.profiles p on p.id = m3.profile_id
       where m3.server_id = s.id and p.last_seen is not null and p.last_seen > now() - interval '5 minutes'),
    sm.sort_pos, sm.pinned, sm.folder_id
  from public.server_members sm
  join public.servers s on s.id = sm.server_id
  where sm.profile_id = auth.uid()
  order by sm.pinned desc, sm.sort_pos asc, s.created_at asc;
$$;
grant execute on function public.get_my_servers() to authenticated;

-- ── Folders owned by the caller ──
create or replace function public.get_my_server_folders()
returns table(id uuid, name text, color text, "position" int)
language sql stable security definer set search_path = public as $$
  select f.id, f.name, f.color, f.position
  from public.server_folders f
  where f.owner_id = auth.uid()
  order by f.position asc, f.created_at asc;
$$;
grant execute on function public.get_my_server_folders() to authenticated;

create or replace function public.create_server_folder(p_name text default null, p_color text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  insert into public.server_folders (owner_id, name, color, position)
  values (me, nullif(trim(coalesce(p_name,'')),''), nullif(trim(coalesce(p_color,'')),''),
    coalesce((select max(position)+1 from public.server_folders where owner_id = me), 0))
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.create_server_folder(text, text) to authenticated;

create or replace function public.update_server_folder(p_folder uuid, p_name text default null, p_color text default null, p_position int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.server_folders set
    name     = case when p_name  is null then name  else nullif(trim(p_name),'') end,
    color    = case when p_color is null then color else nullif(trim(p_color),'') end,
    position = coalesce(p_position, position)
  where id = p_folder and owner_id = auth.uid();
end;
$$;
grant execute on function public.update_server_folder(uuid, text, text, int) to authenticated;

create or replace function public.delete_server_folder(p_folder uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  update public.server_members set folder_id = null
  where profile_id = me and folder_id = p_folder;
  delete from public.server_folders where id = p_folder and owner_id = me;
end;
$$;
grant execute on function public.delete_server_folder(uuid) to authenticated;

-- ── Pin / unpin a server (for the caller only) ──
create or replace function public.toggle_server_pin(p_server uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.server_members set pinned = p_pinned
  where server_id = p_server and profile_id = auth.uid();
end;
$$;
grant execute on function public.toggle_server_pin(uuid, boolean) to authenticated;

-- ── Reorder / re-folder the caller's servers in one shot ──
-- p_items: [{ "server_id": uuid, "folder_id": uuid|null, "position": int }, ...]
create or replace function public.reorder_my_servers(p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); it jsonb;
begin
  for it in select * from jsonb_array_elements(p_items)
  loop
    update public.server_members set
      sort_pos  = coalesce((it->>'position')::int, sort_pos),
      folder_id = nullif(it->>'folder_id','')::uuid
    where server_id = (it->>'server_id')::uuid and profile_id = me;
  end loop;
end;
$$;
grant execute on function public.reorder_my_servers(jsonb) to authenticated;
