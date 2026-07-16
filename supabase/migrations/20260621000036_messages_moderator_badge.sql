-- Surface is_moderator in conversation messages so the moderator badge shows
-- on message authors in DMs/groups, just like the verified check.

drop function if exists public.get_conversation_messages(uuid);
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
  sender_is_verified  boolean,
  sender_is_moderator boolean
)
language sql
stable
security definer
as $$
  select
    m.id, m.content, m.created_at, m.sender_id, m.type, m.call_seconds, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator
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
