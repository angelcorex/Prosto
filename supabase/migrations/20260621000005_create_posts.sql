-- Posts table — one row per published post.
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Content must be 1–500 characters.
alter table public.posts
  add constraint post_content_length
  check (char_length(content) >= 1 and char_length(content) <= 500);

-- Fast lookup: all posts by a given author, newest first.
create index posts_author_created_idx on public.posts (author_id, created_at desc);

-- Row-level security
alter table public.posts enable row level security;

create policy "Posts are viewable by everyone"
  on public.posts for select using (true);

create policy "Users can insert their own posts"
  on public.posts for insert
  with check (author_id = auth.uid());

create policy "Users can delete their own posts"
  on public.posts for delete
  using (author_id = auth.uid());
