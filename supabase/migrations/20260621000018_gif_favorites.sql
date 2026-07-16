-- GIF favorites: store only the Tenor (or external) GIF URLs a user saved.
-- The images themselves live on Tenor's CDN — we never host them.

create table if not exists public.gif_favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  url        text not null,
  preview    text,
  created_at timestamptz not null default now(),
  primary key (user_id, url)
);

alter table public.gif_favorites enable row level security;

drop policy if exists "Users see own gif favorites"   on public.gif_favorites;
drop policy if exists "Users add own gif favorites"    on public.gif_favorites;
drop policy if exists "Users remove own gif favorites" on public.gif_favorites;

create policy "Users see own gif favorites"
  on public.gif_favorites for select using (auth.uid() = user_id);
create policy "Users add own gif favorites"
  on public.gif_favorites for insert with check (auth.uid() = user_id);
create policy "Users remove own gif favorites"
  on public.gif_favorites for delete using (auth.uid() = user_id);
