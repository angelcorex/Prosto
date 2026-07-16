-- ─────────────────────────────────────────────────────────────────────────
-- Surface is_moderator in conversation/member RPCs so the badge shows in the
-- DM list, chat header and group members (like the verified check).
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_conversation_members(uuid);
create or replace function public.get_conversation_members(conv uuid)
returns table(
  id uuid, public_id text, username text, display_name text,
  avatar_url text, is_verified boolean, is_moderator boolean,
  status text, last_seen timestamptz, is_owner boolean
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.public_id::text, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator,
    p.status, p.last_seen, (c.owner_id = p.id)
  from public.conversation_participants cp
  join public.profiles p      on p.id = cp.profile_id
  join public.conversations c on c.id = cp.conversation_id
  where cp.conversation_id = conv
    and exists (select 1 from public.conversation_participants me where me.conversation_id = conv and me.profile_id = auth.uid())
  order by (c.owner_id = p.id) desc, p.username asc;
$$;

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
  other_is_moderator boolean,
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
    o.id, o.public_id::text, o.username, o.display_name, o.avatar_url, o.is_verified, o.is_moderator, o.status, o.last_seen,
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
