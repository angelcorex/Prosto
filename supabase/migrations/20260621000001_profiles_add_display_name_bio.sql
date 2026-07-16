-- Add display_name and avatar_url columns if not already present.
-- This migration is idempotent (uses IF NOT EXISTS / DO NOTHING patterns).

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists bio         text check (char_length(bio) <= 200),
  add column if not exists avatar_url  text;

-- display_name max length
alter table public.profiles
  add constraint display_name_length check (char_length(display_name) <= 50);
