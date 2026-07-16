-- ─────────────────────────────────────────────────────────────────────────
-- Manual (self-declared) connections: let users add a profile link for any
-- platform (X, Bluesky, Steam, Roblox, Telegram, Twitch, GitHub, YouTube,
-- Reddit, TikTok, Instagram, personal site) without an OAuth app.
--
-- The URL is always built server-side from a vetted template (see
-- features/connections/providers.ts) and validated to be http(s) before it
-- reaches this RPC, so no arbitrary/unsafe scheme can be stored. Tokens stay
-- null (nothing to authorize). Re-adding the same provider updates it.

-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.upsert_manual_connection(
  p_provider text,
  p_username text,
  p_url      text
)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;

  insert into public.connections (profile_id, provider, provider_username, provider_url, show_on_profile)
  values (me, p_provider, nullif(trim(p_username), ''), nullif(trim(p_url), ''), true)
  on conflict (profile_id, provider) do update
    set provider_username = excluded.provider_username,
        provider_url      = excluded.provider_url;
end;
$$;
grant execute on function public.upsert_manual_connection(text, text, text) to authenticated;

notify pgrst, 'reload schema';
