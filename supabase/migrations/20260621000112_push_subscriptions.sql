-- ─────────────────────────────────────────────────────────────────────────
-- Web Push subscriptions — background notifications (Telegram-style) that
-- arrive even when the app is closed / the phone is locked.
--
-- Each row is one browser/device push endpoint for a user. The server sends to
-- these endpoints via the web-push protocol (VAPID). A user can have several
-- (phone, laptop, …). Endpoints expire / get replaced, so upsert on endpoint.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

-- Users only see their own subscriptions. Writes go through the RPCs below.
drop policy if exists "Own push subscriptions" on public.push_subscriptions;
create policy "Own push subscriptions"
  on public.push_subscriptions for select using (auth.uid() = profile_id);

-- Register / refresh this device's push subscription.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text
)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (me, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set profile_id = me, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Remove a subscription (e.g. on logout / permission revoke).
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and profile_id = auth.uid();
$$;
grant execute on function public.delete_push_subscription(text) to authenticated;

notify pgrst, 'reload schema';
