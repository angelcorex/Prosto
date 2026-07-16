-- ─────────────────────────────────────────────────────────────────────────
-- 1. ADMINISTRATOR (32768) — a role with this bit implicitly holds EVERY
--    permission (like Discord). Enforced by expanding the permission mask in
--    server_perms / channel_perms to the full mask.
-- 2. MANAGE_INVITES (65536) — gates the new Invites settings tab (view the
--    invite list, delete invites, pause invites).
-- 3. Invite system upgrade: multiple invites per server (one reusable link per
--    inviter), each tracking `uses` and an optional `expires_at`, plus a
--    server-wide pause switch (`servers.invites_paused_until`).
--
-- Full permission mask = OR of every bit 1..65536 = 131071.
-- ─────────────────────────────────────────────────────────────────────────

-- ── server_perms: owner OR an ADMINISTRATOR role → full mask ────────────────
create or replace function public.server_perms(p_server uuid, p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  with base as (
    select case
      when exists (select 1 from public.servers where id = p_server and owner_id = p_user) then 131071::bigint
      else coalesce((
        select bit_or(r.permissions)
        from public.server_roles r
        where r.server_id = p_server
          and (r.is_default or r.id in (
            select mr.role_id from public.server_member_roles mr where mr.profile_id = p_user
          ))
      ), 0::bigint)
    end as m
  )
  select case when (m & 32768) <> 0 then 131071::bigint else m end from base;
$$;
grant execute on function public.server_perms(uuid, uuid) to authenticated;

-- ── channel_perms: owner / ADMINISTRATOR bypass overrides → full mask ───────
create or replace function public.channel_perms(p_channel uuid, p_user uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  v_srv       uuid;
  v_cat       uuid;
  v_owner     boolean;
  v_base      bigint := 0;
  v_role_ids  uuid[];
  v_default   uuid;
  v_ev_a      bigint;
  v_ev_d      bigint;
  v_agg_a     bigint;
  v_agg_d     bigint;
begin
  select sc.server_id, sc.category_id into v_srv, v_cat
    from public.server_channels sc where sc.id = p_channel;
  if v_srv is null then return 0; end if;

  select (owner_id = p_user) into v_owner from public.servers where id = v_srv;
  if v_owner then return 131071::bigint; end if;

  select id into v_default from public.server_roles
    where server_id = v_srv and is_default limit 1;

  v_role_ids := array(
    select r.id from public.server_roles r
    where r.server_id = v_srv
      and (r.is_default or r.id in (
        select mr.role_id from public.server_member_roles mr where mr.profile_id = p_user
      ))
  );

  select coalesce(bit_or(permissions), 0::bigint)
    into v_base from public.server_roles where id = any(v_role_ids);

  -- ADMINISTRATOR bypasses every channel override.
  if (v_base & 32768) <> 0 then return 131071::bigint; end if;

  if v_cat is not null then
    select coalesce(allow, 0), coalesce(deny, 0) into v_ev_a, v_ev_d
      from public.category_role_overrides where category_id = v_cat and role_id = v_default;
    v_base := (v_base & ~coalesce(v_ev_d, 0)) | coalesce(v_ev_a, 0);

    select coalesce(bit_or(allow), 0::bigint), coalesce(bit_or(deny), 0::bigint)
      into v_agg_a, v_agg_d
      from public.category_role_overrides
      where category_id = v_cat and role_id = any(v_role_ids) and role_id <> v_default;
    v_base := (v_base & ~coalesce(v_agg_d, 0)) | coalesce(v_agg_a, 0);
  end if;

  select coalesce(allow, 0), coalesce(deny, 0) into v_ev_a, v_ev_d
    from public.channel_role_overrides where channel_id = p_channel and role_id = v_default;
  v_base := (v_base & ~coalesce(v_ev_d, 0)) | coalesce(v_ev_a, 0);

  select coalesce(bit_or(allow), 0::bigint), coalesce(bit_or(deny), 0::bigint)
    into v_agg_a, v_agg_d
    from public.channel_role_overrides
    where channel_id = p_channel and role_id = any(v_role_ids) and role_id <> v_default;
  v_base := (v_base & ~coalesce(v_agg_d, 0)) | coalesce(v_agg_a, 0);

  return v_base;
end;
$$;
grant execute on function public.channel_perms(uuid, uuid) to authenticated;

-- ── Invite schema: usage counter, optional expiry, allow multiple per server ─
alter table public.server_invites
  add column if not exists uses       int not null default 0,
  add column if not exists expires_at timestamptz;

drop index if exists public.server_invites_server_idx;
create index if not exists server_invites_server_idx on public.server_invites (server_id, created_at desc);

alter table public.servers
  add column if not exists invites_paused_until timestamptz;

-- ── create_server_invite: reuse the caller's active link, else make one ─────
--    Blocked while invites are paused; requires CREATE_INVITE (bit 8).
drop function if exists public.create_server_invite(uuid);
create or replace function public.create_server_invite(p_server uuid, p_expires_seconds int default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tok text; code text; exp timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not public.is_server_member(p_server) then raise exception 'forbidden'; end if;
  if (public.server_perms(p_server, me) & 8) = 0 then raise exception 'forbidden'; end if;
  if exists (select 1 from public.servers
             where id = p_server and invites_paused_until is not null and invites_paused_until > now()) then
    raise exception 'invites_paused';
  end if;

  exp := case when coalesce(p_expires_seconds, 0) > 0
    then now() + make_interval(secs => least(p_expires_seconds, 60*60*24*365)) else null end;

  -- Reuse the caller's existing non-expired link unless a custom expiry is set.
  if p_expires_seconds is null then
    select token into tok from public.server_invites
      where server_id = p_server and inviter_id = me and (expires_at is null or expires_at > now())
      order by created_at desc limit 1;
    if tok is not null then return tok; end if;
  end if;

  loop
    code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    exit when not exists (select 1 from public.server_invites where token = code);
  end loop;
  insert into public.server_invites (token, server_id, inviter_id, expires_at)
  values (code, p_server, me, exp);
  return code;
end;
$$;
grant execute on function public.create_server_invite(uuid, int) to authenticated;

-- ── accept_server_invite: enforce expiry / pause / bans, count real joins ───
drop function if exists public.accept_server_invite(text, text);
create or replace function public.accept_server_invite(p_token text, p_ip text default null)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; pid text; v_ip text := nullif(trim(coalesce(p_ip, '')), ''); v_exp timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select server_id, expires_at into srv, v_exp from public.server_invites where token = p_token;
  if srv is null then raise exception 'invalid invite'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'invite_expired'; end if;
  if exists (select 1 from public.servers
             where id = srv and invites_paused_until is not null and invites_paused_until > now()) then
    raise exception 'invites_paused';
  end if;
  if exists (select 1 from public.server_bans b
             where b.server_id = srv and (b.user_id = me or (v_ip is not null and b.banned_ip = v_ip))) then
    raise exception 'banned';
  end if;

  select public_id::text into pid from public.servers where id = srv;
  if exists (select 1 from public.server_members where server_id = srv and profile_id = me) then
    return pid; -- already a member: no new use counted
  end if;
  insert into public.server_members (server_id, profile_id) values (srv, me);
  update public.server_invites set uses = uses + 1 where token = p_token;
  return pid;
end;
$$;
grant execute on function public.accept_server_invite(text, text) to authenticated;

-- ── Invite management (MANAGE_INVITES = 65536; owner/admin expand to full) ──
create or replace function public.list_server_invites(p_server uuid)
returns table(token text, inviter_id uuid, inviter_username text, inviter_display_name text,
  inviter_avatar_url text, uses int, expires_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.token, i.inviter_id, p.username, p.display_name, p.avatar_url, i.uses, i.expires_at, i.created_at
  from public.server_invites i
  join public.profiles p on p.id = i.inviter_id
  where i.server_id = p_server and (public.server_perms(p_server, auth.uid()) & 65536) <> 0
  order by i.created_at desc;
$$;
grant execute on function public.list_server_invites(uuid) to authenticated;

create or replace function public.delete_server_invite(p_server uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (public.server_perms(p_server, auth.uid()) & 65536) = 0 then raise exception 'forbidden'; end if;
  delete from public.server_invites where server_id = p_server and token = p_token;
end;
$$;
grant execute on function public.delete_server_invite(uuid, text) to authenticated;

-- p_seconds: NULL → resume, <=0 → pause until re-enabled, >0 → pause N seconds.
create or replace function public.set_invites_paused(p_server uuid, p_seconds int default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if (public.server_perms(p_server, auth.uid()) & 65536) = 0 then raise exception 'forbidden'; end if;
  v_until := case
    when p_seconds is null then null
    when p_seconds <= 0 then 'infinity'::timestamptz
    else now() + make_interval(secs => least(p_seconds, 60*60*24*365))
  end;
  update public.servers set invites_paused_until = v_until where id = p_server;
  return v_until;
end;
$$;
grant execute on function public.set_invites_paused(uuid, int) to authenticated;

create or replace function public.get_invites_paused(p_server uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select invites_paused_until from public.servers
  where id = p_server and public.is_server_member(p_server);
$$;
grant execute on function public.get_invites_paused(uuid) to authenticated;

notify pgrst, 'reload schema';
