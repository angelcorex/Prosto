-- ─────────────────────────────────────────────────────────────────────────
-- Post interactions: likes, comments, reposts.
-- Plus feed/profile RPCs that return posts (and reposts) with interaction
-- counts and the viewer's like/repost state in one round-trip.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Likes ──
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
drop policy if exists "likes viewable" on public.post_likes;
create policy "likes viewable" on public.post_likes for select using (true);
drop policy if exists "like self" on public.post_likes;
create policy "like self" on public.post_likes for insert with check (user_id = auth.uid());
drop policy if exists "unlike self" on public.post_likes;
create policy "unlike self" on public.post_likes for delete using (user_id = auth.uid());

-- ── Reposts ──
create table if not exists public.reposts (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.reposts enable row level security;
drop policy if exists "reposts viewable" on public.reposts;
create policy "reposts viewable" on public.reposts for select using (true);
drop policy if exists "repost self" on public.reposts;
create policy "repost self" on public.reposts for insert with check (user_id = auth.uid());
drop policy if exists "unrepost self" on public.reposts;
create policy "unrepost self" on public.reposts for delete using (user_id = auth.uid());

-- ── Comments ──
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;
drop policy if exists "comments viewable" on public.post_comments;
create policy "comments viewable" on public.post_comments for select using (true);
drop policy if exists "comment insert self" on public.post_comments;
create policy "comment insert self" on public.post_comments for insert with check (author_id = auth.uid());
drop policy if exists "comment delete self" on public.post_comments;
create policy "comment delete self" on public.post_comments for delete using (author_id = auth.uid());

-- ── Feed: all posts + reposts, newest activity first ──
create or replace function public.get_feed_posts(viewer uuid, lim int default 60)
returns table(
  id                  uuid,
  content             text,
  created_at          timestamptz,
  author_username     text,
  author_display_name text,
  author_avatar_url   text,
  author_is_verified  boolean,
  like_count          int,
  comment_count       int,
  repost_count        int,
  liked               boolean,
  reposted            boolean,
  reposter_username     text,
  reposter_display_name text,
  feed_at             timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.id, p.content, p.created_at, p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p
    union all
    select p.id, p.content, p.created_at, p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
  )
  select
    b.id, b.content, b.created_at,
    a.username, a.display_name, a.avatar_url, a.is_verified,
    (select count(*) from public.post_likes l    where l.post_id = b.id)::int,
    (select count(*) from public.post_comments c where c.post_id = b.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = b.id)::int,
    exists(select 1 from public.post_likes l where l.post_id = b.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr where rr.post_id = b.id and rr.user_id = viewer),
    rp.username, rp.display_name,
    b.feed_at
  from base b
  join public.profiles a on a.id = b.author_id
  left join public.profiles rp on rp.id = b.reposter_id
  order by b.feed_at desc
  limit lim;
$$;

-- ── Profile: a user's own posts + their reposts ──
create or replace function public.get_user_posts(uname text, viewer uuid)
returns table(
  id                  uuid,
  content             text,
  created_at          timestamptz,
  author_username     text,
  author_display_name text,
  author_avatar_url   text,
  author_is_verified  boolean,
  like_count          int,
  comment_count       int,
  repost_count        int,
  liked               boolean,
  reposted            boolean,
  reposter_username     text,
  reposter_display_name text,
  feed_at             timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (select id from public.profiles where username = uname),
  base as (
    select p.id, p.content, p.created_at, p.author_id, null::uuid as reposter_id, p.created_at as feed_at
    from public.posts p
    where p.author_id = (select id from target)
    union all
    select p.id, p.content, p.created_at, p.author_id, r.user_id as reposter_id, r.created_at as feed_at
    from public.reposts r join public.posts p on p.id = r.post_id
    where r.user_id = (select id from target)
  )
  select
    b.id, b.content, b.created_at,
    a.username, a.display_name, a.avatar_url, a.is_verified,
    (select count(*) from public.post_likes l    where l.post_id = b.id)::int,
    (select count(*) from public.post_comments c where c.post_id = b.id)::int,
    (select count(*) from public.reposts rr      where rr.post_id = b.id)::int,
    exists(select 1 from public.post_likes l where l.post_id = b.id and l.user_id = viewer),
    exists(select 1 from public.reposts rr where rr.post_id = b.id and rr.user_id = viewer),
    rp.username, rp.display_name,
    b.feed_at
  from base b
  join public.profiles a on a.id = b.author_id
  left join public.profiles rp on rp.id = b.reposter_id
  order by b.feed_at desc
  limit 60;
$$;

-- ── Comments for a post ──
create or replace function public.get_post_comments(post uuid)
returns table(
  id                  uuid,
  content             text,
  created_at          timestamptz,
  author_username     text,
  author_display_name text,
  author_avatar_url   text,
  author_is_verified  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.content, c.created_at, a.username, a.display_name, a.avatar_url, a.is_verified
  from public.post_comments c
  join public.profiles a on a.id = c.author_id
  where c.post_id = post
  order by c.created_at asc
  limit 200;
$$;
