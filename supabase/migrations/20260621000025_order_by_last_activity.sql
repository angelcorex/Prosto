-- Order conversations by last activity (most recent message first), so the
-- ordering persists across navigations/reloads — not just optimistically.

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
  pinned             boolean
)
language sql
stable
security definer
as $$
  select
    c.id,
    c.is_group,
    c.public_id::text,
    c.name,
    c.avatar_url,
    (select count(*) from public.conversation_participants cpc where cpc.conversation_id = c.id)::int,
    o.id, o.public_id::text, o.username, o.display_name, o.avatar_url, o.is_verified, o.status, o.last_seen,
    cp.muted, cp.pinned
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
