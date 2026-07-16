-- Add verified badge to profiles.
-- is_verified can only be set by a service-role / admin — regular users
-- cannot flip this themselves because of the RLS policy below.

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

-- Revoke the ability for the owner to update is_verified on their own row.
-- The existing "Users can update their own profile" policy allows update on
-- all columns; we tighten it here by replacing it with a column-restricted
-- version that explicitly excludes is_verified.
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Prevent self-verification: the new value of is_verified must equal
    -- the existing stored value (i.e. the user cannot change it).
    and is_verified = (
      select is_verified from public.profiles where id = auth.uid()
    )
  );

-- ── How to verify a user ──────────────────────────────────────────────────
-- Run this in the Supabase SQL editor (requires service role / dashboard):
--
--   update public.profiles
--   set    is_verified = true
--   where  username = 'mrbeast';
--
-- To revoke:
--
--   update public.profiles
--   set    is_verified = false
--   where  username = 'mrbeast';
-- ─────────────────────────────────────────────────────────────────────────
