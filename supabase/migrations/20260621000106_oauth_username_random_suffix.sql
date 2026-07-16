-- ─────────────────────────────────────────────────────────────────────────
-- OAuth username collisions: when the provider handle (e.g. "mrbeast" from
-- Discord/GitHub/Google) is already taken in Prosto, append a RANDOM number
-- instead of a sequential one — e.g. "mrbeast3141". This keeps handles clean,
-- doesn't leak how many "mrbeast"s already exist, and finds a free handle fast
-- (widening the number pool on repeated collisions, with a uid-slug fallback).
--
-- Supersedes the sequential-suffix logic in 20260621000105_oauth_profile.sql.
-- Still a no-op if the profile already exists (returning users are untouched).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.provision_oauth_profile(p_name text, p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  base   text;
  uname  text;
  suffix text;
  n      int := 0;
begin
  if me is null then return; end if;
  if exists (select 1 from public.profiles where id = me) then return; end if;

  -- Build a username base from the provider handle/name (sanitized).
  base := regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9_]', '', 'g');
  base := regexp_replace(base, '(^_+|_+$)', '', 'g');

  -- Fall back to the email local-part, then a random slug.
  if char_length(base) < 3 then
    select regexp_replace(lower(coalesce(split_part(email, '@', 1), '')), '[^a-z0-9_]', '', 'g')
      into base from auth.users where id = me;
    base := regexp_replace(coalesce(base, ''), '(^_+|_+$)', '', 'g');
  end if;
  if char_length(base) < 3 then
    base := 'user' || substr(replace(me::text, '-', ''), 1, 6);
  end if;
  base := regexp_replace(left(base, 24), '_+$', '', 'g');
  if char_length(base) < 3 then base := base || '00'; end if;

  -- Take the handle as-is when it's free; otherwise append a random number.
  uname := base;
  while exists (select 1 from public.profiles where lower(username) = lower(uname)) loop
    n := n + 1;

    -- Safety net: after many collisions, use a guaranteed-unique uid slug.
    if n > 40 then
      uname := left(base, 12) || substr(replace(me::text, '-', ''), 1, 10);
      exit;
    end if;

    -- Normally a 4-digit suffix (1000–9999, no leading zero); widen to 6 digits
    -- if the shorter pool keeps colliding.
    if n <= 8 then
      suffix := (1000 + floor(random() * 9000))::int::text;
    else
      suffix := (100000 + floor(random() * 900000))::int::text;
    end if;

    -- Keep the whole handle within 24 chars (trim the base, never the number).
    uname := left(base, 24 - char_length(suffix)) || suffix;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (me, uname, nullif(left(trim(coalesce(p_name, '')), 50), ''), nullif(p_avatar, ''))
  on conflict (id) do nothing;
end;
$$;
grant execute on function public.provision_oauth_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
