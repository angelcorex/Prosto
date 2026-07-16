-- Reliable message loading + DM resolution, independent of RLS subtleties.

-- ── Re-assert find_dm_conversation as SECURITY DEFINER (bypasses RLS) ────────
create or replace function public.find_dm_conversation(user_a uuid, user_b uuid)
returns uuid
language sql
stable
security definer
as $$
  select cp1.conversation_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  join public.conversations c on c.id = cp1.conversation_id
  where cp1.profile_id = user_a
    and cp2.profile_id = user_b
    and coalesce(c.is_group, false) = false
    and (select count(*) from public.conversation_participants cp3 where cp3.conversation_id = cp1.conversation_id) = 2
  order by c.created_at asc
  limit 1;
$$;

-- ── Re-assert ensure_dm (find existing 2-person DM or create one) ────────────
create or replace function public.ensure_dm(other uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  me   uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if other is null or other = me then raise exception 'invalid target'; end if;

  select public.find_dm_conversation(me, other) into conv;

  if conv is null then
    conv := gen_random_uuid();
    insert into public.conversations(id, is_group) values (conv, false);
    insert into public.conversation_participants(conversation_id, profile_id)
      values (conv, me), (conv, other);
  else
    update public.conversation_participants
      set hidden = false
      where conversation_id = conv and profile_id = me;
  end if;

  return conv;
end;
$$;

-- ── Reliable message history for a conversation (DM or group) ────────────────
create or replace function public.get_conversation_messages(conv uuid)
returns table(
  id                  uuid,
  content             text,
  created_at          timestamptz,
  sender_id           uuid,
  type                text,
  call_seconds        int,
  reply_to            uuid,
  sender_username     text,
  sender_display_name text,
  sender_avatar_url   text,
  sender_is_verified  boolean
)
language sql
stable
security definer
as $$
  select
    m.id, m.content, m.created_at, m.sender_id, m.type, m.call_seconds, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified
  from public.direct_messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = conv
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conv and cp.profile_id = auth.uid()
    )
  order by m.created_at asc
  limit 200;
$$;
