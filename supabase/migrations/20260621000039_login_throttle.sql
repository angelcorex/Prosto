-- ─────────────────────────────────────────────────────────────────────────
-- Login anti-brute-force throttle.
--
-- Tracks failed sign-in attempts per email in a fixed window. After too many
-- failures the caller must wait out a cooldown. Counts only failures and resets
-- on a successful login, so legitimate users are rarely affected. Callable by
-- anon (sign-in happens before authentication).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.login_attempts (
  email        text        primary key,
  count        integer     not null default 0,
  window_start timestamptz not null default now()
);

alter table public.login_attempts enable row level security;
-- No policies: only SECURITY DEFINER functions below touch this table.

-- Seconds the caller must wait before trying again (0 = allowed now).
create or replace function public.login_cooldown(
  p_email  text,
  p_max    integer default 5,
  p_window integer default 300
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r         public.login_attempts;
  remaining integer;
begin
  select * into r from public.login_attempts where email = lower(p_email);
  if not found then return 0; end if;
  -- Window expired → no longer blocked.
  if r.window_start < now() - make_interval(secs => p_window) then return 0; end if;
  if r.count >= p_max then
    remaining := ceil(extract(epoch from (r.window_start + make_interval(secs => p_window) - now())))::int;
    return greatest(remaining, 1);
  end if;
  return 0;
end;
$$;

-- Record a failed attempt (fixed window per email).
create or replace function public.note_login_failure(
  p_email  text,
  p_window integer default 300
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.login_attempts as la (email, count, window_start)
  values (lower(p_email), 1, now())
  on conflict (email) do update
    set count = case
                  when la.window_start < now() - make_interval(secs => p_window) then 1
                  else la.count + 1
                end,
        window_start = case
                  when la.window_start < now() - make_interval(secs => p_window) then now()
                  else la.window_start
                end;
end;
$$;

-- Clear failures after a successful login.
create or replace function public.clear_login_failures(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.login_attempts where email = lower(p_email);
$$;

grant execute on function public.login_cooldown(text, integer, integer) to anon, authenticated;
grant execute on function public.note_login_failure(text, integer)       to anon, authenticated;
grant execute on function public.clear_login_failures(text)              to anon, authenticated;
