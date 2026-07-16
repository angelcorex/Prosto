-- ─────────────────────────────────────────────────────────────────────────
-- Global per-user notification preferences + privacy get/set RPCs.
--
-- Privacy columns already exist on profiles (migration 117). This adds the
-- GLOBAL notification prefs (sound on/off per surface) that the client notifier
-- reads, plus small RPCs so the settings UI can read/update privacy + notify
-- prefs without touching profiles directly.
--
-- Notification prefs live in their own table (not on profiles) since they're a
-- distinct concern and grow over time.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.user_notify_prefs (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  -- Master switch + per-surface sound toggles. Defaults = everything on, so
  -- current behaviour is unchanged until the user opts out.
  sound_enabled  boolean not null default true,   -- master sound
  dm_sound       boolean not null default true,   -- direct messages
  server_sound   boolean not null default true,   -- server channels (non-ping)
  mention_sound  boolean not null default true,   -- @mentions / pings
  friend_sound   boolean not null default true,   -- friend requests / accepts
  -- Desktop/web toast popups (separate from sound).
  toasts_enabled boolean not null default true,
  updated_at     timestamptz not null default now()
);

alter table public.user_notify_prefs enable row level security;

drop policy if exists "Own notify prefs" on public.user_notify_prefs;
create policy "Own notify prefs"
  on public.user_notify_prefs for select using (auth.uid() = profile_id);

-- Read my notify prefs (returns defaults if no row yet).
create or replace function public.get_notify_prefs()
returns table(sound_enabled boolean, dm_sound boolean, server_sound boolean,
  mention_sound boolean, friend_sound boolean, toasts_enabled boolean)
language sql stable security definer set search_path = public as $$
  select
    coalesce(p.sound_enabled, true), coalesce(p.dm_sound, true),
    coalesce(p.server_sound, true), coalesce(p.mention_sound, true),
    coalesce(p.friend_sound, true), coalesce(p.toasts_enabled, true)
  from (select auth.uid() as id) me
  left join public.user_notify_prefs p on p.profile_id = me.id;
$$;
grant execute on function public.get_notify_prefs() to authenticated;

-- Upsert my notify prefs (only the passed fields change; null = keep).
create or replace function public.set_notify_prefs(
  p_sound_enabled boolean default null,
  p_dm_sound boolean default null,
  p_server_sound boolean default null,
  p_mention_sound boolean default null,
  p_friend_sound boolean default null,
  p_toasts_enabled boolean default null
)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  insert into public.user_notify_prefs (profile_id, sound_enabled, dm_sound,
      server_sound, mention_sound, friend_sound, toasts_enabled)
  values (me, coalesce(p_sound_enabled, true), coalesce(p_dm_sound, true),
      coalesce(p_server_sound, true), coalesce(p_mention_sound, true),
      coalesce(p_friend_sound, true), coalesce(p_toasts_enabled, true))
  on conflict (profile_id) do update set
    sound_enabled  = coalesce(p_sound_enabled,  user_notify_prefs.sound_enabled),
    dm_sound       = coalesce(p_dm_sound,        user_notify_prefs.dm_sound),
    server_sound   = coalesce(p_server_sound,    user_notify_prefs.server_sound),
    mention_sound  = coalesce(p_mention_sound,   user_notify_prefs.mention_sound),
    friend_sound   = coalesce(p_friend_sound,    user_notify_prefs.friend_sound),
    toasts_enabled = coalesce(p_toasts_enabled,  user_notify_prefs.toasts_enabled),
    updated_at     = now();
end;
$$;
grant execute on function public.set_notify_prefs(boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

-- ── Privacy get/set (privacy_* columns live on profiles, migration 117) ─────
create or replace function public.get_privacy_settings()
returns table(privacy_profile public.privacy_level, privacy_messages public.privacy_level,
  privacy_friend_req public.privacy_level)
language sql stable security definer set search_path = public as $$
  select privacy_profile, privacy_messages, privacy_friend_req
  from public.profiles where id = auth.uid();
$$;
grant execute on function public.get_privacy_settings() to authenticated;

create or replace function public.set_privacy_settings(
  p_profile public.privacy_level default null,
  p_messages public.privacy_level default null,
  p_friend_req public.privacy_level default null
)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  update public.profiles set
    privacy_profile    = coalesce(p_profile, privacy_profile),
    privacy_messages   = coalesce(p_messages, privacy_messages),
    privacy_friend_req = coalesce(p_friend_req, privacy_friend_req)
  where id = me;
end;
$$;
grant execute on function public.set_privacy_settings(public.privacy_level, public.privacy_level, public.privacy_level) to authenticated;

notify pgrst, 'reload schema';
