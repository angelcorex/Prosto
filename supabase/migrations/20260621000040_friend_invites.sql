-- ─────────────────────────────────────────────────────────────────────────
-- Friend invite links.
--
-- A user generates a stable shareable token. Opening the link shows a preview
-- (for OG/social cards) and, once signed in, lets the visitor confirm adding
-- the inviter. Accepting makes them friends, ensures a DM and drops a "friends"
-- system message so both sides see a clean "you're now friends" event.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.friend_invites (
  token       text        primary key,
  inviter_id  uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
-- One reusable invite per user (nicer for sharing/marketing).
create unique index if not exists friend_invites_inviter_idx on public.friend_invites (inviter_id);

alter table public.friend_invites enable row level security;
-- No policies: access is only through the SECURITY DEFINER functions below.

-- Create (or reuse) the caller's invite token.
create or replace function public.create_friend_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  tok text;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  select token into tok from public.friend_invites where inviter_id = me;
  if tok is not null then return tok; end if;

  tok := replace(gen_random_uuid()::text, '-', '');
  insert into public.friend_invites (token, inviter_id)
  values (tok, me)
  on conflict (inviter_id) do update set token = public.friend_invites.token
  returning token into tok;

  return tok;
end;
$$;

-- Public preview of an invite (for the landing page + OG card).
create or replace function public.get_friend_invite(p_token text)
returns table(
  inviter_id   uuid,
  username     text,
  display_name text,
  avatar_url   text,
  public_id    text,
  is_verified  boolean,
  is_moderator boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.public_id::text, p.is_verified, p.is_moderator
  from public.friend_invites fi
  join public.profiles p on p.id = fi.inviter_id
  where fi.token = p_token;
$$;

-- Accept an invite: become friends + ensure a DM + "friends" system message.
-- Returns the inviter's public_id so the client can open the DM.
create or replace function public.accept_friend_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  inviter uuid;
  conv    uuid;
  cpid    text;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  select inviter_id into inviter from public.friend_invites where token = p_token;
  if inviter is null then raise exception 'invalid invite'; end if;
  if inviter = me then raise exception 'self'; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = me and b.blocked_id = inviter)
       or (b.blocker_id = inviter and b.blocked_id = me)
  ) then
    raise exception 'blocked';
  end if;

  -- Friendship as a single accepted row (clear any pendings both directions).
  delete from public.friend_requests
    where (from_id = me and to_id = inviter) or (from_id = inviter and to_id = me);
  insert into public.friend_requests (from_id, to_id, status)
    values (inviter, me, 'accepted')
    on conflict (from_id, to_id) do update set status = 'accepted';

  -- Ensure the DM conversation between the two.
  select public.find_dm_conversation(me, inviter) into conv;
  if conv is null then
    conv := gen_random_uuid();
    insert into public.conversations(id, is_group) values (conv, false);
    insert into public.conversation_participants(conversation_id, profile_id)
      values (conv, me), (conv, inviter);
  else
    update public.conversation_participants set hidden = false where conversation_id = conv;
  end if;

  -- "You're now friends" system event (renders centered in the chat).
  insert into public.direct_messages(conversation_id, sender_id, content, type)
    values (conv, me, 'friends', 'system');

  perform public.notify_once(inviter, 'friend_accepted', me, null);

  select p.public_id::text into cpid from public.profiles p where p.id = inviter;
  return cpid;
end;
$$;

revoke all on function public.create_friend_invite()       from public, anon;
revoke all on function public.accept_friend_invite(text)    from public, anon;
grant execute on function public.create_friend_invite()     to authenticated;
grant execute on function public.get_friend_invite(text)    to anon, authenticated;
grant execute on function public.accept_friend_invite(text) to authenticated;
