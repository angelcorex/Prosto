-- ─────────────────────────────────────────────────────────────────────────
-- Device sessions: one row per open client (tab / app), heartbeated while the
-- site/app is running. A device counts as "active" while its session was seen
-- within the activity window — robust to AFK / backgrounded tabs (unlike a raw
-- realtime-presence connection, which flaps). Used to show one icon per active
-- device next to a user's name.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.user_sessions (
  session_id text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  device     text not null,
  last_seen  timestamptz not null default now()
);
create index if not exists user_sessions_user_idx on public.user_sessions (user_id, last_seen);

alter table public.user_sessions enable row level security;
drop policy if exists "sessions readable" on public.user_sessions;
create policy "sessions readable" on public.user_sessions for select using (true);

-- Upsert this client's session (called by the heartbeat). Also opportunistically
-- prunes long-dead sessions so the table stays small.
create or replace function public.session_heartbeat(p_session text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_session is null or p_session = '' then return; end if;
  insert into public.user_sessions (session_id, user_id, device, last_seen)
  values (p_session, auth.uid(), coalesce(nullif(p_device, ''), 'desktop'), now())
  on conflict (session_id) do update set last_seen = now(), device = excluded.device, user_id = excluded.user_id;

  delete from public.user_sessions where last_seen < now() - interval '15 minutes';
end;
$$;
grant execute on function public.session_heartbeat(text, text) to authenticated;

-- End a session immediately (called on unload / sign-out) for a faster drop.
create or replace function public.end_session(p_session text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.user_sessions where session_id = p_session and user_id = auth.uid();
end;
$$;
grant execute on function public.end_session(text) to authenticated;

-- Distinct active device kinds per user, within the activity window.
create or replace function public.get_user_devices(p_ids uuid[])
returns table(user_id uuid, device text)
language sql stable security definer set search_path = public as $$
  select distinct user_id, device
  from public.user_sessions
  where user_id = any(p_ids)
    and last_seen > now() - interval '5 minutes';
$$;
grant execute on function public.get_user_devices(uuid[]) to authenticated, anon;
