-- ─────────────────────────────────────────────────────────────────────────
-- Give every profile that never had an avatar (the old letter placeholder)
-- one of the two built-in default avatars, distributed deterministically by
-- a hash of the profile id so it's stable and roughly 50/50.
-- Also set a column default so any future insert without an avatar still gets
-- a real image instead of the placeholder.
-- ─────────────────────────────────────────────────────────────────────────

update public.profiles
set avatar_url = case
  when (get_byte(decode(md5(id::text), 'hex'), 0) % 2) = 0
    then '/material/avatars/default/avatar1.webp'
  else '/material/avatars/default/avatar2.webp'
end
where avatar_url is null or btrim(avatar_url) = '';

alter table public.profiles
  alter column avatar_url set default '/material/avatars/default/avatar1.webp';
