-- Add pronouns column (free-form text, max 40 chars).
alter table public.profiles
  add column if not exists pronouns text check (char_length(pronouns) <= 40);
