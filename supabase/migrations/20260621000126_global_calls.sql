-- Durable, RLS-protected discovery for global 1:1 WebRTC calls.
-- Media remains peer-to-peer/TURN and subsequent signaling uses a random
-- call-specific Realtime Broadcast topic. The persisted offer lets a recipient
-- discover an incoming call from any authenticated page without trusting a
-- public per-user broadcast channel.

create table if not exists public.call_invites (
  id              uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id       uuid not null references public.profiles(id) on delete cascade,
  callee_id       uuid not null references public.profiles(id) on delete cascade,
  offer           jsonb not null,
  status          text not null default 'ringing' check (status in ('ringing', 'ended')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '2 minutes'),
  constraint call_invites_distinct_participants check (caller_id <> callee_id)
);

create index if not exists call_invites_callee_pending_idx
  on public.call_invites (callee_id, created_at desc)
  where status = 'ringing';
create index if not exists call_invites_expiry_idx on public.call_invites (expires_at);

alter table public.call_invites enable row level security;

drop policy if exists "Call participants can view invites" on public.call_invites;
create policy "Call participants can view invites"
  on public.call_invites for select
  using (auth.uid() = caller_id or auth.uid() = callee_id);

revoke all on table public.call_invites from anon, authenticated;
grant select on table public.call_invites to authenticated;

create or replace function public.create_call_invite(invite_id uuid, conv_id uuid, invite_offer jsonb)
returns table (id uuid, callee_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  peer uuid;
  expiry timestamptz := now() + interval '2 minutes';
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if invite_id is null then raise exception 'invalid invite id'; end if;
  if jsonb_typeof(invite_offer) <> 'object'
     or invite_offer->>'type' <> 'offer'
     or coalesce(char_length(invite_offer->>'sdp'), 0) < 1
     or char_length(invite_offer->>'sdp') > 200000 then
    raise exception 'invalid offer';
  end if;

  if coalesce((select c.is_group from public.conversations c where c.id = conv_id), true) then
    raise exception 'only direct calls are supported';
  end if;
  if not exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conv_id and cp.profile_id = me
  ) then
    raise exception 'not a participant';
  end if;
  if (select count(*) from public.conversation_participants cp where cp.conversation_id = conv_id) <> 2 then
    raise exception 'invalid direct conversation';
  end if;

  select cp.profile_id into peer
  from public.conversation_participants cp
  where cp.conversation_id = conv_id and cp.profile_id <> me
  limit 1;
  if peer is null then raise exception 'recipient not found'; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = me and b.blocked_id = peer)
       or (b.blocker_id = peer and b.blocked_id = me)
  ) then raise exception 'blocked'; end if;

  perform public.check_rate_limit('call_invite', 10, 60);

  -- One live call per user. Stale ringing rows are closed before creating a new
  -- invite, preventing old offers from resurfacing after reconnect.
  update public.call_invites
  set status = 'ended'
  where status = 'ringing'
    and (expires_at <= now() or caller_id = me or callee_id = me);

  insert into public.call_invites (id, conversation_id, caller_id, callee_id, offer, expires_at)
  values (invite_id, conv_id, me, peer, invite_offer, expiry);

  return query select invite_id, peer, expiry;
end;
$$;

create or replace function public.end_call_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  update public.call_invites
  set status = 'ended'
  where id = invite_id
    and status = 'ringing'
    and (caller_id = auth.uid() or callee_id = auth.uid());
end;
$$;

revoke all on function public.create_call_invite(uuid, uuid, jsonb) from public, anon;
revoke all on function public.end_call_invite(uuid) from public, anon;
grant execute on function public.create_call_invite(uuid, uuid, jsonb) to authenticated;
grant execute on function public.end_call_invite(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_invites'
  ) then
    alter publication supabase_realtime add table public.call_invites;
  end if;
end;
$$;

notify pgrst, 'reload schema';
