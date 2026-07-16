-- ─────────────────────────────────────────────────────────────────────────
-- Short, Discord-style numeric id for custom emojis (snowflake) so they can be
-- referenced as `<:name:id>` / `<a:name:id>` with a compact, copyable id — just
-- like user/server ids. bigint exceeds JS safe-int, so RPCs return it as text.
-- ─────────────────────────────────────────────────────────────────────────

-- Backfill in safe steps (add nullable → fill → default → not null → unique),
-- matching how profile/server public ids were introduced.
alter table public.server_emojis
  add column if not exists public_id bigint;

update public.server_emojis
  set public_id = public.gen_snowflake()
  where public_id is null;

alter table public.server_emojis
  alter column public_id set default public.gen_snowflake();

alter table public.server_emojis
  alter column public_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'server_emojis_public_id_unique'
  ) then
    alter table public.server_emojis add constraint server_emojis_public_id_unique unique (public_id);
  end if;
end $$;

-- list_server_emojis: recreate to also return the short public id (as text).
drop function if exists public.list_server_emojis(uuid);
create or replace function public.list_server_emojis(p_server uuid)
returns table(id uuid, public_id text, name text, url text, is_animated boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.public_id::text, e.name, e.url, e.is_animated, e.created_at
  from public.server_emojis e
  where e.server_id = p_server and public.is_server_member(p_server)
  order by e.created_at desc;
$$;
grant execute on function public.list_server_emojis(uuid) to authenticated;

-- Resolve an emoji by its short public id — so `<:name:id>` tokens render
-- anywhere (chat, bio, nicknames), including for viewers who aren't members of
-- the emoji's server. Emoji images are public, so this exposes only name/url.
create or replace function public.get_emoji_by_public_id(p_id text)
returns table(id uuid, public_id text, name text, url text, is_animated boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.public_id::text, e.name, e.url, e.is_animated
  from public.server_emojis e
  where e.public_id = p_id::bigint;
$$;
grant execute on function public.get_emoji_by_public_id(text) to authenticated, anon;
