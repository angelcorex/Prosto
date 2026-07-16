-- ── Custom invite links: max_uses cap + per-invite expiry from the UI ────────
--
-- Adds `max_uses` (null = unlimited) to server_invites so the creator can
-- limit how many times a link can be used.  The existing `uses` counter and
-- `expires_at` column are already present (migration 100).

alter table public.server_invites
  add column if not exists max_uses int check (max_uses is null or max_uses > 0);

-- ── create_server_invite: now also accepts p_max_uses ────────────────────────
drop function if exists public.create_server_invite(uuid, int);
create or replace function public.create_server_invite(
  p_server   uuid,
  p_expires_seconds int default null,
  p_max_uses int default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  me   uuid := auth.uid();
  tok  text;
  code text;
  exp  timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not public.is_server_member(p_server) then raise exception 'forbidden'; end if;
  if (public.server_perms(p_server, me) & 8) = 0 then raise exception 'forbidden'; end if;
  if exists (
    select 1 from public.servers
    where id = p_server
      and invites_paused_until is not null
      and invites_paused_until > now()
  ) then
    raise exception 'invites_paused';
  end if;

  exp := case
    when coalesce(p_expires_seconds, 0) > 0
    then now() + make_interval(secs => least(p_expires_seconds, 60*60*24*365))
    else null
  end;

  -- Reuse the caller's existing non-expired, unlimited-use link only when
  -- no custom options were requested.
  if p_expires_seconds is null and p_max_uses is null then
    select token into tok
      from public.server_invites
      where server_id  = p_server
        and inviter_id = me
        and (expires_at is null or expires_at > now())
        and max_uses is null
      order by created_at desc
      limit 1;
    if tok is not null then return tok; end if;
  end if;

  -- Generate a collision-free 10-char token.
  loop
    code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    exit when not exists (select 1 from public.server_invites where token = code);
  end loop;

  insert into public.server_invites (token, server_id, inviter_id, expires_at, max_uses)
  values (code, p_server, me, exp, nullif(p_max_uses, 0));

  return code;
end;
$$;
grant execute on function public.create_server_invite(uuid, int, int) to authenticated;

-- ── accept_server_invite: honour max_uses cap ────────────────────────────────
drop function if exists public.accept_server_invite(text, text);
create or replace function public.accept_server_invite(
  p_token text,
  p_ip    text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  srv   uuid;
  v_ip  text := nullif(trim(coalesce(p_ip, '')), '');
  v_exp timestamptz;
  v_max int;
  v_uses int;
  pid   text;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  select server_id, expires_at, max_uses, uses
    into srv, v_exp, v_max, v_uses
    from public.server_invites where token = p_token;

  if srv is null then raise exception 'invalid invite'; end if;
  if v_exp is not null and v_exp <= now() then raise exception 'invite_expired'; end if;
  if v_max is not null and v_uses >= v_max then raise exception 'invite_maxed'; end if;

  if exists (
    select 1 from public.servers
    where id = srv
      and invites_paused_until is not null
      and invites_paused_until > now()
  ) then
    raise exception 'invites_paused';
  end if;

  if exists (
    select 1 from public.server_bans b
    where b.server_id = srv
      and (b.user_id = me or (v_ip is not null and b.banned_ip = v_ip))
  ) then
    raise exception 'banned';
  end if;

  select public_id::text into pid from public.servers where id = srv;

  if exists (select 1 from public.server_members where server_id = srv and profile_id = me) then
    return pid; -- already a member, don't count again
  end if;

  insert into public.server_members (server_id, profile_id) values (srv, me);
  update public.server_invites set uses = uses + 1 where token = p_token;
  return pid;
end;
$$;
grant execute on function public.accept_server_invite(text, text) to authenticated;

-- ── list_server_invites: expose max_uses ─────────────────────────────────────
-- Return type changes (adds max_uses), so the old function must be dropped
-- first — Postgres can't CREATE OR REPLACE with a different OUT-param row type.
drop function if exists public.list_server_invites(uuid);
create or replace function public.list_server_invites(p_server uuid)
returns table(
  token               text,
  inviter_id          uuid,
  inviter_username    text,
  inviter_display_name text,
  inviter_avatar_url  text,
  uses                int,
  max_uses            int,
  expires_at          timestamptz,
  created_at          timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    i.token, i.inviter_id,
    p.username, p.display_name, p.avatar_url,
    i.uses, i.max_uses, i.expires_at, i.created_at
  from public.server_invites i
  join public.profiles p on p.id = i.inviter_id
  where i.server_id = p_server
    and (public.server_perms(p_server, auth.uid()) & 65536) <> 0
  order by i.created_at desc;
$$;
grant execute on function public.list_server_invites(uuid) to authenticated;

notify pgrst, 'reload schema';
