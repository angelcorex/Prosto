-- Add banner_url column for profile page background banner.
alter table public.profiles
  add column if not exists banner_url text;
