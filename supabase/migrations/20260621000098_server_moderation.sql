-- ─────────────────────────────────────────────────────────────────────────
-- Server moderation: ownership transfer, kick/ban/timeout permissions, IP
-- bans, and a per-member timeout (mute). Discord-style.
--
-- New permission bits (extend the mask from migration 66):
--   4096  KICK      — remove a member from the server
--   8192  BAN       — ban a member (account + best-effort IP), see bans list
--   16384 TIMEOUT   — mute a member for a duration (blocks sending everywhere)
-- The owner implicitly has every bit (see can_mod).
-- ─────────────────────────────────────────────────────────────────────────

-- ── Timeout state on the membership row ────────────────────────────────────
alter table public.server_members
  add column if not exists timeout_until  timestamptz,
  add column if not exists timeout_reason text,
  add column if not exists timeout_by     uuid references public.profiles(id) on delete set null;

-- ── Ban list (account + optional IP) ───────────────────────────────────────
create table if not exists public.server_bans (
  server_id  uuid not null references public.servers(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reason     text,
  banned_by  uuid references public.profiles(id) on delete set null,
  banned_ip  text,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index if not exists server_bans_server_idx on public.server_bans (server_id, created_at desc);
create index if not exists server_bans_ip_idx on public.server_bans (server_id, banned_ip) where banned_ip is not null;
alter table public.server_bans enable row level security;
-- No policies: only the SECURITY DEFINER RPCs below touch this table.

-- ── Recent client IPs per user (for best-effort IP bans) ───────────────────
-- Privacy: we keep only the few most recent IPs and never expose them to
-- clients except as the opaque value stored on a ban row (mods only).
create table if not exists public.user_ips (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  ip        text not null,
  last_seen timestamptz not null default now(),
  primary key (user_id, ip)
);
alter table public.user_ips enable row level security;
-- No policies: only the definer RPCs below touch this table.

create or replace function public.note_user_ip(p_ip text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_ip text := nullif(trim(coalesce(p_ip, '')), '');
begin
  if me is null or v_ip is null then return; end if;
  insert into public.user_ips (user_id, ip, last_seen)
  values (me, left(v_ip, 64), now())
  on conflict (user_id, ip) do update set last_seen = now();
  -- Keep only the 5 most-recent IPs per user.
  delete from public.user_ips u
   where u.user_id = me
     and u.ip not in (select ip from public.user_ips where user_id = me order by last_seen desc limit 5);
end;
$$;
grant execute on function public.note_user_ip(text) to authenticated;

-- ── Permission helper: owner OR holds a bit (owner's stored mask predates the
--    new high bits, so an explicit owner check is required). ────────────────
create or replace function public.can_mod(p_server uuid, p_bit bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.servers where id = p_server and owner_id = auth.uid())
      or (public.server_perms(p_server, auth.uid()) & p_bit) <> 0;
$$;
grant execute on function public.can_mod(uuid, bigint) to authenticated;

-- ── Transfer ownership (current owner only) ────────────────────────────────
create or replace function public.transfer_server_ownership(p_server uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.servers where id = p_server and owner_id = me) then
    raise exception 'forbidden';
  end if;
  if p_target = me then raise exception 'already owner'; end if;
  if not exists (select 1 from public.server_members where server_id = p_server and profile_id = p_target) then
    raise exception 'not a member';
  end if;
  update public.servers set owner_id = p_target where id = p_server;
  -- A fresh owner shouldn't inherit a timeout.
  update public.server_members
    set timeout_until = null, timeout_reason = null, timeout_by = null
    where server_id = p_server and profile_id = p_target;
end;
$$;
grant execute on function public.transfer_server_ownership(uuid, uuid) to authenticated;

-- ── Kick: re-assert remove_member gated on KICK (was MANAGE_SERVER) ─────────
create or replace function public.remove_member(p_server uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_mod(p_server, 4096) then raise exception 'forbidden'; end if;
  if p_member = auth.uid() then raise exception 'cannot remove self'; end if;
  if exists (select 1 from public.servers where id = p_server and owner_id = p_member) then
    raise exception 'cannot remove owner';
  end if;
  delete from public.server_members where server_id = p_server and profile_id = p_member;
end;
$$;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- ── Ban / unban ────────────────────────────────────────────────────────────
create or replace function public.ban_member(p_server uuid, p_target uuid, p_reason text default null, p_ip text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_ip text;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not public.can_mod(p_server, 8192) then raise exception 'forbidden'; end if;
  if p_target = me then raise exception 'cannot ban self'; end if;
  if exists (select 1 from public.servers where id = p_server and owner_id = p_target) then
    raise exception 'cannot ban owner';
  end if;
  -- Prefer an explicitly supplied IP, else the target's most recent known IP.
  v_ip := coalesce(
    nullif(trim(coalesce(p_ip, '')), ''),
    (select ip from public.user_ips where user_id = p_target order by last_seen desc limit 1)
  );
  insert into public.server_bans (server_id, user_id, reason, banned_by, banned_ip)
  values (p_server, p_target, nullif(trim(coalesce(p_reason, '')), ''), me, v_ip)
  on conflict (server_id, user_id) do update
    set reason    = excluded.reason,
        banned_by = excluded.banned_by,
        banned_ip = coalesce(excluded.banned_ip, public.server_bans.banned_ip),
        created_at = now();
  delete from public.server_members where server_id = p_server and profile_id = p_target;
end;
$$;
grant execute on function public.ban_member(uuid, uuid, text, text) to authenticated;

create or replace function public.unban_member(p_server uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_mod(p_server, 8192) then raise exception 'forbidden'; end if;
  delete from public.server_bans where server_id = p_server and user_id = p_target;
end;
$$;
grant execute on function public.unban_member(uuid, uuid) to authenticated;

create or replace function public.list_server_bans(p_server uuid, p_query text default null)
returns table(user_id uuid, public_id text, username text, display_name text, avatar_url text,
  reason text, banned_ip text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.user_id, p.public_id::text, p.username, p.display_name, p.avatar_url,
         b.reason, b.banned_ip, b.created_at
  from public.server_bans b
  join public.profiles p on p.id = b.user_id
  where b.server_id = p_server
    and public.can_mod(p_server, 8192)
    and (
      nullif(trim(coalesce(p_query, '')), '') is null
      or p.username ilike '%' || trim(p_query) || '%'
      or coalesce(p.display_name, '') ilike '%' || trim(p_query) || '%'
      or p.public_id::text = trim(p_query)
    )
  order by b.created_at desc
  limit 200;
$$;
grant execute on function public.list_server_bans(uuid, text) to authenticated;

-- ── Timeout (mute) ──────────────────────────────────────────────────────────
create or replace function public.timeout_member(p_server uuid, p_target uuid, p_seconds int, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not public.can_mod(p_server, 16384) then raise exception 'forbidden'; end if;
  if p_target = me then raise exception 'cannot timeout self'; end if;
  if exists (select 1 from public.servers where id = p_server and owner_id = p_target) then
    raise exception 'cannot timeout owner';
  end if;
  if not exists (select 1 from public.server_members where server_id = p_server and profile_id = p_target) then
    raise exception 'not a member';
  end if;
  if coalesce(p_seconds, 0) <= 0 then
    update public.server_members set timeout_until = null, timeout_reason = null, timeout_by = null
      where server_id = p_server and profile_id = p_target;
    return;
  end if;
  update public.server_members
    set timeout_until  = now() + make_interval(secs => least(p_seconds, 60 * 60 * 24 * 366)),
        timeout_reason = nullif(trim(coalesce(p_reason, '')), ''),
        timeout_by     = me
    where server_id = p_server and profile_id = p_target;
end;
$$;
grant execute on function public.timeout_member(uuid, uuid, int, text) to authenticated;

create or replace function public.remove_timeout(p_server uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_mod(p_server, 16384) then raise exception 'forbidden'; end if;
  update public.server_members set timeout_until = null, timeout_reason = null, timeout_by = null
    where server_id = p_server and profile_id = p_target;
end;
$$;
grant execute on function public.remove_timeout(uuid, uuid) to authenticated;

-- ── Join guards: reject banned users (by account or matching IP) ───────────
drop function if exists public.accept_server_invite(text);
create or replace function public.accept_server_invite(p_token text, p_ip text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; pid text; v_ip text := nullif(trim(coalesce(p_ip, '')), '');
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select server_id into srv from public.server_invites where token = p_token;
  if srv is null then raise exception 'invalid invite'; end if;
  if exists (
    select 1 from public.server_bans b
    where b.server_id = srv
      and (b.user_id = me or (v_ip is not null and b.banned_ip = v_ip))
  ) then raise exception 'banned'; end if;
  insert into public.server_members (server_id, profile_id) values (srv, me) on conflict do nothing;
  select public_id::text into pid from public.servers where id = srv;
  return pid;
end;
$$;
grant execute on function public.accept_server_invite(text, text) to authenticated;

drop function if exists public.join_public_server(text);
create or replace function public.join_public_server(p_public_id text, p_ip text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; v_ip text := nullif(trim(coalesce(p_ip, '')), '');
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select id into srv from public.servers where public_id::text = p_public_id and is_public = true;
  if srv is null then raise exception 'not found'; end if;
  if exists (
    select 1 from public.server_bans b
    where b.server_id = srv
      and (b.user_id = me or (v_ip is not null and b.banned_ip = v_ip))
  ) then raise exception 'banned'; end if;
  insert into public.server_members (server_id, profile_id) values (srv, me) on conflict do nothing;
  return p_public_id;
end;
$$;
grant execute on function public.join_public_server(text, text) to authenticated;

-- Refresh PostgREST's schema cache so the new RPCs resolve immediately.
notify pgrst, 'reload schema';
