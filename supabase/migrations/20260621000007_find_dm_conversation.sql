-- Returns the conversation_id of the direct conversation between two users,
-- or NULL if none exists.
create or replace function public.find_dm_conversation(user_a uuid, user_b uuid)
returns uuid
language sql
stable
as $$
  select cp1.conversation_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  where cp1.profile_id = user_a
    and cp2.profile_id = user_b
  -- Ensure it's a two-person conversation (no group chats)
  and (
    select count(*) from public.conversation_participants cp3
    where cp3.conversation_id = cp1.conversation_id
  ) = 2
  limit 1;
$$;
