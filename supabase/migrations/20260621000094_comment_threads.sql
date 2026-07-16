-- ─────────────────────────────────────────────────────────────────────────
-- Reddit-style threaded comments: a comment may reply to another comment.
--
-- Adds a self-referential `parent_id` to post_comments (a NULL parent means a
-- top-level comment). The client fetches the flat list and builds the tree.
-- Deleting a comment cascades to its replies. `get_post_comments` now also
-- returns `parent_id`; the row shape is otherwise unchanged.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.post_comments
  add column if not exists parent_id uuid references public.post_comments(id) on delete cascade;

create index if not exists post_comments_parent_idx on public.post_comments (parent_id);

drop function if exists public.get_post_comments(uuid);
create or replace function public.get_post_comments(post uuid)
returns table(
  id uuid, parent_id uuid, content text, created_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  author_is_verified boolean, author_is_moderator boolean, author_is_premium boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.parent_id, c.content, c.created_at,
         a.username, a.display_name, a.avatar_url, a.is_verified, a.is_moderator, a.is_premium
  from public.post_comments c
  join public.profiles a on a.id = c.author_id
  where c.post_id = post
  order by c.created_at asc
  limit 500;
$$;
grant execute on function public.get_post_comments(uuid) to authenticated, anon;
