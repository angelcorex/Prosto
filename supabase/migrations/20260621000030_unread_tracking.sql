-- ─────────────────────────────────────────────────────────────────────────
-- Persistent unread tracking.
--
-- Until now "unread" was derived only from realtime INSERT events while the
-- page was open, so it reset on reload and missed messages received while the
-- user was offline. We now track a per-participant `last_read_at` and compute
-- unread = messages newer than that timestamp from other senders. This is the
-- single source of truth, surviving reloads and offline periods.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.conversation_participants
  add column if not exists last_read_at timestamptz;

-- Baseline: treat all pre-existing history as read (so we don't suddenly mark
-- every old message unread). Only fills rows that were never set; future
-- conversations start with NULL and correctly count their first messages.
update public.conversation_participants
  set last_read_at = now()
  where last_read_at is null;

-- Mark a conversation read for the current user (advances last_read_at to now).
create or replace function public.mark_conversation_read(conv_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = conv_id and profile_id = auth.uid();
$$;

-- Re-assert get_my_conversations with an unread_count column.
drop function if exists public.get_my_conversations(uuid);
create or replace function public.get_my_conversations(my_id uuid)
returns table(
  conversation_id    uuid,
  is_group           boolean,
  conv_public_id     text,
  group_name         text,
  group_avatar       text,
  member_count       int,
  other_id           uuid,
  other_public_id    text,
  other_username     text,
  other_display_name text,
  other_avatar_url   text,
  other_is_verified  boolean,
  other_status       text,
  other_last_seen    timestamptz,
  muted              boolean,
  pinned             boolean,
  unread_count       int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.is_group,
    c.public_id::text,
    c.name,
    c.avatar_url,
    (select count(*) from public.conversation_participants cpc where cpc.conversation_id = c.id)::int,
    o.id, o.public_id::text, o.username, o.display_name, o.avatar_url, o.is_verified, o.status, o.last_seen,
    cp.muted, cp.pinned,
    (
      select count(*)
      from public.direct_messages dm
      where dm.conversation_id = c.id
        and dm.sender_id <> my_id
        and coalesce(dm.type, 'text') <> 'system'
        and dm.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz)
    )::int as unread_count
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  left join lateral (
    select p.* from public.conversation_participants cp2
    join public.profiles p on p.id = cp2.profile_id
    where cp2.conversation_id = c.id and cp2.profile_id <> my_id
    limit 1
  ) o on (not c.is_group)
  where cp.profile_id = my_id and cp.hidden = false
  order by
    cp.pinned desc,
    coalesce(
      (select max(dm.created_at) from public.direct_messages dm where dm.conversation_id = c.id),
      c.created_at
    ) desc;
$$;
