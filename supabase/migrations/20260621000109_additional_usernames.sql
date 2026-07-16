-- ─────────────────────────────────────────────────────────────────────────
-- Additional usernames (Telegram-style handle aliases).
--
-- Every profile keeps its canonical `profiles.username` (the one it was created
-- with and the only handle a free account can hold). Super Prosto subscribers
-- can claim up to 4 EXTRA usernames — 5 total — stored here. Each alias is
-- globally unique across BOTH tables, is searchable, and resolves to the owner
-- (the app redirects /u/<alias> → /u/<primary> so there's one canonical URL and
-- the ~20 RPCs keyed on profiles.username never need to change).
--
-- Downgrade policy: when Super Prosto lapses the extra usernames are freed
-- (deleted) — see prune_extra_usernames(), called from the premium-revoke path.
-- The canonical profiles.username is always kept.
-- ─────────────────────────────────────────────────────────────────────────

-- Max EXTRA usernames a subscriber can hold (on top of profiles.username).
-- 4 extra + 1 canonical = 5 total, matching the Super Prosto perk copy.
-- Kept as a SQL function so the value has a single source of truth in the DB.
create or replace function public.max_extra_usernames()
returns int language sql immutable as $$ select 4 $$;

create table if not exists public.profile_usernames (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  username   text not null,
  created_at timestamptz not null default now(),
  -- Same format contract as profiles.username (3–30 chars, see migration 0).
  constraint profile_username_format
    check (username ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$')
);

-- Case-insensitive global uniqueness WITHIN this table.
create unique index if not exists profile_usernames_lower_idx
  on public.profile_usernames (lower(username));

-- Fast "all aliases for a profile" lookup.
create index if not exists profile_usernames_profile_idx
  on public.profile_usernames (profile_id);

alter table public.profile_usernames enable row level security;

-- Aliases are public (they appear on profiles and in search), like usernames.
drop policy if exists "Aliases are viewable by everyone" on public.profile_usernames;
create policy "Aliases are viewable by everyone"
  on public.profile_usernames for select using (true);

-- All writes go through security-definer RPCs (which enforce premium + limit +
-- cross-table uniqueness). No direct client insert/update/delete.

-- ── Cross-table uniqueness ───────────────────────────────────────────────────
-- A handle must be unique across profiles.username AND profile_usernames. The
-- per-table unique indexes can't see each other, so two triggers close the gap
-- regardless of the write path (RPC, updateProfile upsert, OAuth provisioning).

-- True when `handle` is already used as a canonical username or an alias by
-- anyone other than `owner` (pass null to check against everyone).
create or replace function public.username_taken(handle text, owner uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.profiles p
            where lower(p.username) = lower(handle)
              and (owner is null or p.id <> owner))
    or
    exists (select 1 from public.profile_usernames a
            where lower(a.username) = lower(handle)
              and (owner is null or a.profile_id <> owner));
$$;

-- Guard on profiles: a canonical username can't collide with anyone's alias.
create or replace function public.guard_profile_username()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.profile_usernames a
    where lower(a.username) = lower(new.username) and a.profile_id <> new.id
  ) then
    raise exception 'username_taken' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_username on public.profiles;
create trigger guard_profile_username
  before insert or update of username on public.profiles
  for each row execute function public.guard_profile_username();

-- Guard on aliases: an alias can't collide with anyone's canonical username or
-- another user's alias (the unique index covers same-table dup casing too).
create or replace function public.guard_alias_username()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.profiles p where lower(p.username) = lower(new.username)
  ) then
    raise exception 'username_taken' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_alias_username on public.profile_usernames;
create trigger guard_alias_username
  before insert or update of username on public.profile_usernames
  for each row execute function public.guard_alias_username();

-- ── RPC: claim an extra username ─────────────────────────────────────────────
-- Enforces: authenticated, Super Prosto subscriber, under the extra-username
-- limit, valid format, and globally free. Returns the created alias id.
create or replace function public.add_username(p_username text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  handle text := lower(trim(p_username));
  premium boolean;
  new_id uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  select is_premium into premium from public.profiles where id = me;
  if not coalesce(premium, false) then raise exception 'not_premium'; end if;

  if handle !~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$' then
    raise exception 'invalid_format';
  end if;

  -- Can't re-claim your own canonical username as an alias.
  if exists (select 1 from public.profiles where id = me and lower(username) = handle) then
    raise exception 'username_taken';
  end if;

  if public.username_taken(handle, me) then raise exception 'username_taken'; end if;

  if (select count(*) from public.profile_usernames where profile_id = me)
       >= public.max_extra_usernames() then
    raise exception 'limit_reached';
  end if;

  insert into public.profile_usernames (profile_id, username)
  values (me, handle)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.add_username(text) to authenticated;

-- ── RPC: release one of my extra usernames ───────────────────────────────────
create or replace function public.remove_username(p_username text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  delete from public.profile_usernames
  where profile_id = me and lower(username) = lower(trim(p_username));
end;
$$;
grant execute on function public.remove_username(text) to authenticated;

-- ── RPC: my extra usernames (for the settings manager) ───────────────────────
create or replace function public.list_my_usernames()
returns table(username text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select username, created_at
  from public.profile_usernames
  where profile_id = auth.uid()
  order by created_at asc;
$$;
grant execute on function public.list_my_usernames() to authenticated;

-- ── RPC: resolve any handle → its canonical username ─────────────────────────
-- Returns the profiles.username that owns `p_handle`, whether `p_handle` is the
-- canonical username itself or one of its aliases. Null when nobody owns it.
-- Used by /u/<handle> to redirect an alias to the one canonical profile URL.
create or replace function public.resolve_username(p_handle text)
returns text language sql stable security definer set search_path = public as $$
  select p.username
  from public.profiles p
  where lower(p.username) = lower(p_handle)
  union all
  select p.username
  from public.profile_usernames a
  join public.profiles p on p.id = a.profile_id
  where lower(a.username) = lower(p_handle)
  limit 1;
$$;
grant execute on function public.resolve_username(text) to authenticated, anon;

-- ── RPC: a profile's public extra usernames (shown as chips on the profile) ──
create or replace function public.get_profile_usernames(p_username text)
returns table(username text)
language sql stable security definer set search_path = public as $$
  select a.username
  from public.profile_usernames a
  join public.profiles p on p.id = a.profile_id
  where lower(p.username) = lower(p_username)
  order by a.created_at asc;
$$;
grant execute on function public.get_profile_usernames(text) to authenticated, anon;

-- ── Downgrade cleanup: free the extra usernames when premium is lost ─────────
-- Called explicitly from the premium-revoke path. Also runs automatically via
-- the trigger below so a direct `is_premium = false` dashboard update is safe.
create or replace function public.prune_extra_usernames(p_profile uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.profile_usernames where profile_id = p_profile;
$$;

create or replace function public.on_premium_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_premium = true and new.is_premium = false then
    delete from public.profile_usernames where profile_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_premium_change on public.profiles;
create trigger on_premium_change
  after update of is_premium on public.profiles
  for each row execute function public.on_premium_change();

notify pgrst, 'reload schema';
