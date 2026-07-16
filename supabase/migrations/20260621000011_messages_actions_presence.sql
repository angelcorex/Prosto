-- ── Reply support ──
alter table public.direct_messages
  add column if not exists reply_to uuid references public.direct_messages(id) on delete set null;

-- ── Allow deleting own messages ──
drop policy if exists "Senders can delete their messages" on public.direct_messages;
create policy "Senders can delete their messages"
  on public.direct_messages for delete
  using (sender_id = auth.uid());

-- ── Presence: manual status + last seen ──
alter table public.profiles
  add column if not exists status text not null default 'online'
    check (status in ('online','idle','dnd','offline')),
  add column if not exists last_seen timestamptz not null default now();

create index if not exists profiles_last_seen_idx on public.profiles (last_seen);

-- send_dm with optional reply_to
drop function if exists public.send_dm(uuid, text);
create or replace function public.send_dm(conv_id uuid, body text, reply uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  new_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = conv_id and profile_id = me) then
    raise exception 'not a participant';
  end if;
  body := trim(body);
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;

  insert into public.direct_messages (conversation_id, sender_id, content, reply_to)
  values (conv_id, me, body, reply)
  returning direct_messages.id, direct_messages.created_at into new_id, new_at;

  update public.conversation_participants set hidden = false where conversation_id = conv_id;

  insert into public.notifications (user_id, type, actor_id, ref_id)
  select profile_id, 'message', me, conv_id
  from public.conversation_participants
  where conversation_id = conv_id and profile_id <> me;

  return query select new_id, new_at;
end;
$$;

-- Heartbeat helper — updates the caller's last_seen (and optionally status)
create or replace function public.heartbeat(new_status text default null)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set last_seen = now(),
      status = coalesce(new_status, status)
  where id = auth.uid();
end;
$$;

-- get_my_conversations now returns presence info
drop function if exists public.get_my_conversations(uuid);
create or replace function public.get_my_conversations(my_id uuid)
returns table(
  conversation_id    uuid,
  other_id           uuid,
  other_username     text,
  other_display_name text,
  other_avatar_url   text,
  other_is_verified  boolean,
  other_status       text,
  other_last_seen    timestamptz
)
language sql stable security definer
as $$
  select
    cp1.conversation_id, p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.status, p.last_seen
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id and cp2.profile_id <> cp1.profile_id
  join public.profiles p on p.id = cp2.profile_id
  where cp1.profile_id = my_id and cp1.hidden = false;
$$;

-- other participant of a conversation incl. presence
drop function if exists public.get_conversation_other_participant(uuid, uuid);
create or replace function public.get_conversation_other_participant(conv_id uuid, my_id uuid)
returns table(
  username     text,
  display_name text,
  avatar_url   text,
  is_verified  boolean,
  status       text,
  last_seen    timestamptz
)
language sql stable security definer
as $$
  select p.username, p.display_name, p.avatar_url, p.is_verified, p.status, p.last_seen
  from public.conversation_participants cp
  join public.profiles p on p.id = cp.profile_id
  where cp.conversation_id = conv_id and cp.profile_id <> my_id
  limit 1;
$$;
