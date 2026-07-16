-- ─────────────────────────────────────────────────────────────────────────
-- Custom server emojis. Each server may hold up to 100 static + 50 animated
-- (GIF) emojis, each image up to 512 KB (enforced client/action-side). Managed
-- by members with MANAGE_SERVER (bit 4); visible to all members.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.server_emojis (
  id          uuid primary key default gen_random_uuid(),
  server_id   uuid not null references public.servers(id) on delete cascade,
  name        text not null,
  url         text not null,
  is_animated boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists server_emojis_server_idx on public.server_emojis(server_id);
-- Case-insensitive unique name per server (expression → must be a unique index,
-- not a table UNIQUE constraint).
create unique index if not exists server_emojis_name_uidx
  on public.server_emojis (server_id, lower(name));

alter table public.server_emojis enable row level security;

-- Members can read a server's emojis; writes go through the RPCs below.
drop policy if exists server_emojis_select on public.server_emojis;
create policy server_emojis_select on public.server_emojis
  for select using (public.is_server_member(server_id));

-- List a server's emojis (members only).
create or replace function public.list_server_emojis(p_server uuid)
returns table(id uuid, name text, url text, is_animated boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.url, e.is_animated, e.created_at
  from public.server_emojis e
  where e.server_id = p_server and public.is_server_member(p_server)
  order by e.created_at desc;
$$;
grant execute on function public.list_server_emojis(uuid) to authenticated;

-- Add an emoji. Sanitises the name, enforces per-type caps and uniqueness.
create or replace function public.add_server_emoji(
  p_server uuid, p_name text, p_url text, p_animated boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  clean text;
  cnt   int;
  new_id uuid;
begin
  if not public.has_perm(p_server, 4) then raise exception 'forbidden'; end if;

  clean := lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9_]', '', 'g'));
  if length(clean) < 2 or length(clean) > 32 then
    raise exception 'invalid name';
  end if;

  select count(*) into cnt from public.server_emojis
    where server_id = p_server and is_animated = p_animated;
  if p_animated and cnt >= 50 then raise exception 'animated limit reached'; end if;
  if not p_animated and cnt >= 100 then raise exception 'emoji limit reached'; end if;

  insert into public.server_emojis (server_id, name, url, is_animated, created_by)
  values (p_server, clean, p_url, p_animated, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.add_server_emoji(uuid, text, text, boolean) to authenticated;

-- Delete an emoji (requires MANAGE_SERVER on its server).
create or replace function public.delete_server_emoji(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid;
begin
  select server_id into srv from public.server_emojis where id = p_id;
  if srv is null then return; end if;
  if not public.has_perm(srv, 4) then raise exception 'forbidden'; end if;
  delete from public.server_emojis where id = p_id;
end;
$$;
grant execute on function public.delete_server_emoji(uuid) to authenticated;

-- Rename an emoji (requires MANAGE_SERVER). Sanitises + enforces uniqueness.
create or replace function public.rename_server_emoji(p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare srv uuid; clean text;
begin
  select server_id into srv from public.server_emojis where id = p_id;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 4) then raise exception 'forbidden'; end if;

  clean := lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9_]', '', 'g'));
  if length(clean) < 2 or length(clean) > 32 then
    raise exception 'invalid name';
  end if;
  if exists (
    select 1 from public.server_emojis
    where server_id = srv and lower(name) = clean and id <> p_id
  ) then
    raise exception 'duplicate name';
  end if;

  update public.server_emojis set name = clean where id = p_id;
end;
$$;
grant execute on function public.rename_server_emoji(uuid, text) to authenticated;
