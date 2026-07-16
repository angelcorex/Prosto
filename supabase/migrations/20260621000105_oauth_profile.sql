-- ─────────────────────────────────────────────────────────────────────────
-- OAuth sign-in (Google / GitHub / Discord): provision a profile on first
-- login, deriving a unique username from the provider's name/handle and
-- carrying over the display name + avatar. Called by the /auth/callback route
-- after the session is established. No-op if the profile already exists (so a
-- returning OAuth user never has their username/avatar overwritten).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.provision_oauth_profile(p_name text, p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  base  text;
  uname text;
  n     int := 0;
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

  -- Ensure uniqueness.
  uname := base;
  while exists (select 1 from public.profiles where lower(username) = lower(uname)) loop
    n := n + 1;
    uname := left(base, 22) || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (me, uname, nullif(left(trim(coalesce(p_name, '')), 50), ''), nullif(p_avatar, ''))
  on conflict (id) do nothing;
end;
$$;
grant execute on function public.provision_oauth_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
