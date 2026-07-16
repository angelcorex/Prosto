-- Allow a user to hide a conversation from their own DM list (without
-- deleting the conversation or messages for the other person).
alter table public.conversation_participants
  add column if not exists hidden boolean not null default false;

-- Allow updating own participant row (to toggle hidden)
drop policy if exists "Update own participant row" on public.conversation_participants;
create policy "Update own participant row"
  on public.conversation_participants for update
  using (profile_id = auth.uid());

-- get_my_conversations must exclude hidden conversations for the requester
create or replace function public.get_my_conversations(my_id uuid)
returns table(
  conversation_id    uuid,
  other_id           uuid,
  other_username     text,
  other_display_name text,
  other_avatar_url   text,
  other_is_verified  boolean
)
language sql
stable
security definer
as $$
  select
    cp1.conversation_id,
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.is_verified
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id
    and cp2.profile_id <> cp1.profile_id
  join public.profiles p on p.id = cp2.profile_id
  where cp1.profile_id = my_id
    and cp1.hidden = false;
$$;

-- Helper to unhide a conversation for ALL participants (used when a new
-- message arrives so the thread reappears for anyone who dismissed it).
create or replace function public.unhide_conversation(conv_id uuid)
returns void
language sql
security definer
as $$
  update public.conversation_participants
  set hidden = false
  where conversation_id = conv_id;
$$;
