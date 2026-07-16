-- ─────────────────────────────────────────────────────────────────────────
-- Admin panel: elevated role, audit trail, and an application event log.
--
-- Role model (layered above moderation):
--   is_moderator — cleans up content (existing).
--   is_admin     — sees stats/users/logs, grants roles. Strictly higher.
-- The owner grants is_admin manually (like is_moderator), e.g.
--   update public.profiles set is_admin = true where username = 'owner';
--
-- Security posture (see [[security-model]]): the browser holds the anon key and
-- can call PostgREST directly, so RLS is the real boundary. Both new tables are
-- admin-read-only with NO write policies — every write goes through a
-- SECURITY DEFINER RPC (which bypasses RLS) or the service-role logger. Every
-- admin RPC re-checks is_admin(auth.uid()) itself and raises on failure, so a
-- forged direct call gains nothing.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists is_admin boolean not null default false;
  
-- Reusable predicate for RLS/RPC guards. STABLE + definer so it can read
-- profiles regardless of the caller's own row-level visibility.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;
grant execute on function public.is_admin(uuid) to authenticated;

-- ── Audit log: one row per privileged admin action ──────────────────────────
create table if not exists public.admin_audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid not null references public.profiles(id) on delete cascade,
  action     text not null,                 -- e.g. 'set_flags'
  target_id  uuid references public.profiles(id) on delete set null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx   on public.admin_audit_log (actor_id, created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists "audit readable by admins" on public.admin_audit_log;
create policy "audit readable by admins" on public.admin_audit_log
  for select using (public.is_admin(auth.uid()));
-- No INSERT/UPDATE/DELETE policies: only SECURITY DEFINER RPCs write here.

-- ── App events: the application logger sink ─────────────────────────────────
-- Fed by src/lib/log via the service-role client for notable events only
-- (errors, admin actions, auth) — routine requests stay in the console/pm2 to
-- avoid write amplification.
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  level      text not null default 'info'   -- 'debug'|'info'|'warn'|'error'
             check (level in ('debug', 'info', 'warn', 'error')),
  kind       text not null,                 -- e.g. 'auth', 'upload', 'admin-action'
  message    text not null,
  user_id    uuid references public.profiles(id) on delete set null,
  path       text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_events_created_idx     on public.app_events (created_at desc);
create index if not exists app_events_level_idx        on public.app_events (level, created_at desc);
create index if not exists app_events_kind_idx         on public.app_events (kind, created_at desc);

alter table public.app_events enable row level security;
drop policy if exists "events readable by admins" on public.app_events;
create policy "events readable by admins" on public.app_events
  for select using (public.is_admin(auth.uid()));
-- No write policies: the service-role logger bypasses RLS; clients cannot forge.

-- ─────────────────────────────────────────────────────────────────────────
-- Admin RPCs. Same security-definer model as the rest of the app. Each guards
-- on is_admin(auth.uid()) first and raises 'forbidden' otherwise, so being
-- callable by `authenticated` is safe — authorization lives in the function.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Dashboard metrics ───────────────────────────────────────────────────────
-- Active-user windows use profiles.last_seen (the heartbeat updates it and it
-- persists), NOT user_sessions (pruned after 15 min, so useless for WAU/MAU).
-- "online" is the live 5-minute session window.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'total_users',    (select count(*) from public.profiles),
    'new_7d',         (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_30d',        (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'dau',            (select count(*) from public.profiles where last_seen > now() - interval '1 day'),
    'wau',            (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    'mau',            (select count(*) from public.profiles where last_seen > now() - interval '30 days'),
    'online',         (select count(distinct user_id) from public.user_sessions where last_seen > now() - interval '5 minutes'),
    'posts',          (select count(*) from public.posts),
    'messages',       (select count(*) from public.direct_messages),
    'channel_messages', (select count(*) from public.channel_messages),
    'servers',        (select count(*) from public.servers),
    'moderators',     (select count(*) from public.profiles where is_moderator),
    'premium',        (select count(*) from public.profiles where is_premium)
  ) into result;

  return result;
end;
$$;
grant execute on function public.admin_stats() to authenticated;

-- ── Signups per day, most-recent day last (for the dashboard chart) ─────────
-- Returns exactly `days` rows including zero-signup days (gap-filled), so the
-- client can render a continuous series without patching holes.
create or replace function public.admin_signups_series(days int default 30)
returns table(day date, count int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  days := greatest(1, least(coalesce(days, 30), 365));

  return query
  with span as (
    select generate_series(
      (current_date - (days - 1) * interval '1 day')::date,
      current_date,
      interval '1 day'
    )::date as day
  )
  select s.day,
         (select count(*) from public.profiles p
           where p.created_at >= s.day and p.created_at < s.day + interval '1 day')::int
  from span s
  order by s.day;
end;
$$;
grant execute on function public.admin_signups_series(int) to authenticated;

-- ── User search + pagination ────────────────────────────────────────────────
-- Case-insensitive match on username OR display_name. Sanitize the '%' and '_'
-- LIKE wildcards in the caller-supplied term so it can't broaden the match.
create or replace function public.admin_list_users(
  search text default null,
  lim    int  default 50,
  off    int  default 0
)
returns table(
  id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, is_premium boolean, is_admin boolean,
  created_at timestamptz, last_seen timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare term text;
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  lim := greatest(1, least(coalesce(lim, 50), 100));
  off := greatest(0, coalesce(off, 0));
  term := nullif(trim(coalesce(search, '')), '');
  if term is not null then
    term := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select p.id, p.username, p.display_name, p.avatar_url,
         p.is_verified, p.is_moderator, p.is_premium, p.is_admin,
         p.created_at, p.last_seen
  from public.profiles p
  where term is null
     or p.username ilike term
     or coalesce(p.display_name, '') ilike term
  order by p.created_at desc
  limit lim offset off;
end;
$$;
grant execute on function public.admin_list_users(text, int, int) to authenticated;

-- ── Grant/revoke role flags (audited) ───────────────────────────────────────
-- NULL args leave a flag unchanged; only non-null ones are applied. Every call
-- that changes something writes an admin_audit_log row with before→after.
create or replace function public.admin_set_flags(
  target       uuid,
  p_moderator  boolean default null,
  p_verified   boolean default null,
  p_premium    boolean default null,
  p_admin      boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); before record;
begin
  if not public.is_admin(me) then raise exception 'forbidden'; end if;
  if target is null then raise exception 'invalid target'; end if;

  select is_moderator, is_verified, is_premium, is_admin
    into before from public.profiles where id = target;
  if not found then raise exception 'no such user'; end if;

  update public.profiles set
    is_moderator = coalesce(p_moderator, is_moderator),
    is_verified  = coalesce(p_verified,  is_verified),
    is_premium   = coalesce(p_premium,   is_premium),
    is_admin     = coalesce(p_admin,     is_admin)
  where id = target;

  insert into public.admin_audit_log (actor_id, action, target_id, detail)
  values (me, 'set_flags', target, jsonb_strip_nulls(jsonb_build_object(
    'is_moderator', case when p_moderator is not null and p_moderator is distinct from before.is_moderator
                         then jsonb_build_object('from', before.is_moderator, 'to', p_moderator) end,
    'is_verified',  case when p_verified is not null and p_verified is distinct from before.is_verified
                         then jsonb_build_object('from', before.is_verified, 'to', p_verified) end,
    'is_premium',   case when p_premium is not null and p_premium is distinct from before.is_premium
                         then jsonb_build_object('from', before.is_premium, 'to', p_premium) end,
    'is_admin',     case when p_admin is not null and p_admin is distinct from before.is_admin
                         then jsonb_build_object('from', before.is_admin, 'to', p_admin) end
  )));
end;
$$;
grant execute on function public.admin_set_flags(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- ── Recent app events, newest first, optional level filter ──────────────────
create or replace function public.admin_recent_events(
  p_level text default null,
  lim     int  default 100
)
returns setof public.app_events
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  lim := greatest(1, least(coalesce(lim, 100), 500));

  return query
  select * from public.app_events e
  where p_level is null or e.level = p_level
  order by e.created_at desc
  limit lim;
end;
$$;
grant execute on function public.admin_recent_events(text, int) to authenticated;

-- ── Recent audit-log entries, newest first ──────────────────────────────────
create or replace function public.admin_recent_audit(lim int default 100)
returns setof public.admin_audit_log
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  lim := greatest(1, least(coalesce(lim, 100), 500));
  return query
  select * from public.admin_audit_log order by created_at desc limit lim;
end;
$$;
grant execute on function public.admin_recent_audit(int) to authenticated;

-- ── Database health / infrastructure metrics ────────────────────────────────
-- Server + Postgres vitals for the "System" page: version, on-disk size, live
-- connections vs the configured ceiling, buffer cache hit ratio, and a
-- per-table size/row-estimate breakdown for the app's core tables. Runs as the
-- function owner (definer), so it can read the pg_stat_* views a normal role
-- can't. Everything is best-effort and wrapped so a missing view never breaks
-- the page.
create or replace function public.admin_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result       jsonb;
  cache_ratio  numeric;
  tables       jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;

  -- Buffer cache hit ratio across user tables (1.0 = everything served from RAM).
  select round(
           sum(heap_blks_hit)::numeric
           / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 4)
    into cache_ratio
  from pg_statio_user_tables;

  -- Size + live-row estimate for the core tables (skips ones not present).
  select jsonb_agg(t order by t->>'total_bytes' desc)
    into tables
  from (
    select jsonb_build_object(
             'name', c.relname,
             'total_bytes', pg_total_relation_size(c.oid),
             'rows', coalesce(s.n_live_tup, 0)
           ) as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'profiles', 'posts', 'direct_messages', 'channel_messages',
        'conversations', 'servers', 'notifications', 'app_events',
        'user_sessions', 'follows', 'friend_requests'
      )
  ) sub;

  select jsonb_build_object(
    'postgres_version',   current_setting('server_version'),
    'db_size_bytes',      pg_database_size(current_database()),
    'connections_active', (select count(*) from pg_stat_activity where datname = current_database()),
    'connections_max',    current_setting('max_connections')::int,
    'cache_hit_ratio',    coalesce(cache_ratio, 0),
    'db_started_at',      (select pg_postmaster_start_time()),
    'now',                now(),
    'tables',             coalesce(tables, '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
grant execute on function public.admin_health() to authenticated;

-- ── API/gateway latency probe ───────────────────────────────────────────────
-- A trivial no-table RPC. Timing it end-to-end from the app measures the
-- PostgREST gateway + network round-trip, isolated from any query cost.
create or replace function public.admin_ping()
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return now();
end;
$$;
grant execute on function public.admin_ping() to authenticated;

-- ── Representative DB-query latency probe ───────────────────────────────────
-- A LIGHT, indexed single-row read — reflects what a normal app query costs,
-- unlike admin_health() (which sums pg_total_relation_size over every table and
-- is deliberately heavy). Timing this end-to-end is the honest "how fast is a
-- typical query right now" number for the dashboard.
create or replace function public.admin_db_probe()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare n int;
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  select 1 into n from public.profiles order by created_at desc limit 1;
  return coalesce(n, 0);
end;
$$;
grant execute on function public.admin_db_probe() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Metric history: time-series snapshots so the dashboard can chart how online
-- / active-user counts moved over time (raw last_seen only holds the CURRENT
-- value; user_sessions is pruned at 15 min — neither can reconstruct history).
--
-- The snapshot is taken opportunistically from session_heartbeat, throttled so
-- at most one row is written every ~5 minutes globally. That means history
-- accrues for free WHILE anyone is active, with no cron dependency. When the
-- app is idle no snapshots are taken (there's nothing to record anyway).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.metric_snapshots (
  id          bigint generated always as identity primary key,
  taken_at    timestamptz not null default now(),
  online      int not null default 0,
  dau         int not null default 0,
  wau         int not null default 0,
  mau         int not null default 0,
  total_users int not null default 0,
  -- Latency history (ms). gateway_ms = client-measured heartbeat RPC round-trip
  -- (PostgREST + network); db_ms = server-measured cost of the snapshot's own
  -- aggregate queries. Null when unknown (e.g. a 2-arg legacy heartbeat call).
  gateway_ms  int,
  db_ms       int
);
create index if not exists metric_snapshots_taken_idx on public.metric_snapshots (taken_at desc);

alter table public.metric_snapshots enable row level security;
drop policy if exists "snapshots readable by admins" on public.metric_snapshots;
create policy "snapshots readable by admins" on public.metric_snapshots
  for select using (public.is_admin(auth.uid()));
-- No write policies: only the definer function below inserts.

-- Compute + store one snapshot, but only if the newest is older than 5 min.
-- Cheap: the throttle check is a single indexed max() read; the heavier counts
-- run only when we actually insert. `p_gateway_ms` is the caller's measured RPC
-- round-trip; `db_ms` is timed here around the aggregate queries.
create or replace function public.record_metric_snapshot(p_gateway_ms int default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  last_at   timestamptz;
  t0        timestamptz;
  v_online  int;
  v_dau     int;
  v_wau     int;
  v_mau     int;
  v_total   int;
begin
  select max(taken_at) into last_at from public.metric_snapshots;
  if last_at is not null and last_at > now() - interval '5 minutes' then
    return;  -- too soon; keep ~5-min resolution
  end if;

  t0 := clock_timestamp();
  select count(distinct user_id) into v_online from public.user_sessions where last_seen > now() - interval '5 minutes';
  select count(*) into v_dau   from public.profiles where last_seen > now() - interval '1 day';
  select count(*) into v_wau   from public.profiles where last_seen > now() - interval '7 days';
  select count(*) into v_mau   from public.profiles where last_seen > now() - interval '30 days';
  select count(*) into v_total from public.profiles;

  insert into public.metric_snapshots (online, dau, wau, mau, total_users, gateway_ms, db_ms)
  values (
    v_online, v_dau, v_wau, v_mau, v_total,
    case when p_gateway_ms between 0 and 60000 then p_gateway_ms end,
    (extract(epoch from (clock_timestamp() - t0)) * 1000)::int
  );

  -- Keep the table bounded (~90 days at 5-min resolution ≈ 26k rows).
  delete from public.metric_snapshots where taken_at < now() - interval '90 days';
end;
$$;
grant execute on function public.record_metric_snapshot(int) to authenticated;

-- Re-assert session_heartbeat (latest was migration 065) with an opportunistic
-- snapshot tacked on the end. Best-effort: wrapped so a snapshot hiccup never
-- breaks presence. New optional `p_gateway_ms` carries the client's measured
-- round-trip of the PREVIOUS heartbeat, feeding the latency history. Drop the
-- old 2-arg signature first so the new default-arg version replaces it cleanly.
drop function if exists public.session_heartbeat(text, text);
create or replace function public.session_heartbeat(p_session text, p_device text, p_gateway_ms int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_session is null or p_session = '' then return; end if;
  insert into public.user_sessions (session_id, user_id, device, last_seen)
  values (p_session, auth.uid(), coalesce(nullif(p_device, ''), 'desktop'), now())
  on conflict (session_id) do update set last_seen = now(), device = excluded.device, user_id = excluded.user_id;

  delete from public.user_sessions where last_seen < now() - interval '15 minutes';

  begin
    perform public.record_metric_snapshot(p_gateway_ms);
  exception when others then
    null;  -- never let metric bookkeeping affect presence
  end;
end;
$$;
grant execute on function public.session_heartbeat(text, text, int) to authenticated;

-- ── Metric time-series for the dashboard drill-down ─────────────────────────
-- `metric` ∈ online|dau|wau|mau|total_users. Returns snapshot points within the
-- last `hours`, oldest first (for a left-to-right chart).
create or replace function public.admin_metric_series(p_metric text, p_hours int default 168)
returns table(t timestamptz, v int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  p_hours := greatest(1, least(coalesce(p_hours, 168), 2160));  -- ≤ 90 days
  if p_metric not in ('online', 'dau', 'wau', 'mau', 'total_users', 'gateway_ms', 'db_ms') then
    raise exception 'invalid metric';
  end if;

  -- gateway_ms/db_ms can be null in a row; skip those points so the chart only
  -- plots real readings.
  return query execute format(
    'select taken_at, %1$I from public.metric_snapshots
       where taken_at > now() - make_interval(hours => $1)
         and %1$I is not null
       order by taken_at asc',
    p_metric
  ) using p_hours;
end;
$$;
grant execute on function public.admin_metric_series(text, int) to authenticated;

-- ── Cumulative user growth (real history from created_at, no snapshots) ─────
-- Running total of profiles at the end of each day for the last `days` days.
create or replace function public.admin_growth_series(days int default 30)
returns table(day date, total int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  days := greatest(1, least(coalesce(days, 30), 365));

  return query
  with span as (
    select generate_series(
      (current_date - (days - 1) * interval '1 day')::date,
      current_date, interval '1 day')::date as day
  )
  select s.day,
         (select count(*) from public.profiles p
           where p.created_at < s.day + interval '1 day')::int
  from span s
  order by s.day;
end;
$$;
grant execute on function public.admin_growth_series(int) to authenticated;

notify pgrst, 'reload schema';
