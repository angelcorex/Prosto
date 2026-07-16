-- Profiles table — one row per user, created on sign-up.
-- username is globally unique, lowercase, no spaces.

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  display_name text,
  bio         text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Username must be 3–30 chars, alphanumeric + underscore, no leading/trailing underscores.
alter table public.profiles
  add constraint username_format
  check (username ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$');

-- Unique index (case-insensitive enforced by storing lowercase only)
create unique index profiles_username_idx on public.profiles (lower(username));

-- Row-level security
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);
