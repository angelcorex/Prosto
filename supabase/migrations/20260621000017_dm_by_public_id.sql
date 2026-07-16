-- Short DM URLs: route conversations by the other user's numeric public_id.

-- Make find_dm_conversation bypass RLS so it reliably finds the 2-person DM
-- even when called directly from the client.
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
  where cp1.profile_id = user_a
    and cp2.profile_id = user_b
  and (
    select count(*) from public.conversation_participants cp3
    where cp3.conversation_id = cp1.conversation_id
  ) = 2
  limit 1;
$$;

-- Find or create the direct conversation between the caller and another user.
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
    insert into public.conversations(id) values (conv);
    insert into public.conversation_participants(conversation_id, profile_id)
      values (conv, me), (conv, other);
  else
    -- If conversation exists, unhide it for the caller (in case it was previously hidden).
    update public.conversation_participants
      set hidden = false
      where conversation_id = conv and profile_id = me;
  end if;

  return conv;
end;
$$;

-- get_my_conversations now also returns the other user's public_id (for short links).
drop function if exists public.get_my_conversations(uuid);
create or replace function public.get_my_conversations(my_id uuid)
returns table(
  conversation_id    uuid,
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
language sql stable security definer
as $$
  select
    cp1.conversation_id, p.id, p.public_id::text, p.username, p.display_name, p.avatar_url,
    p.is_verified, p.status, p.last_seen, cp1.muted, cp1.pinned
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id and cp2.profile_id <> cp1.profile_id
  join public.profiles p on p.id = cp2.profile_id
  where cp1.profile_id = my_id and cp1.hidden = false
  order by cp1.pinned desc;
$$;
