-- User quick-menu actions: block, mute & pin conversations, relationship lookup.

-- ── Blocks ─────────────────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;
create policy "Users see own blocks"   on public.blocks for select using (auth.uid() = blocker_id);
create policy "Users can block others"  on public.blocks for insert with check (auth.uid() = blocker_id);
create policy "Users can unblock"       on public.blocks for delete using (auth.uid() = blocker_id);

-- ── Per-user conversation settings: mute & pin ───────────────────────────────
alter table public.conversation_participants
  add column if not exists muted  boolean not null default false,
  add column if not exists pinned boolean not null default false;

-- ── Relationship lookup between the caller and a target user ─────────────────
create or replace function public.get_user_relationship(target_username text)
returns table(
  target_id    uuid,
  is_friend    boolean,
  req_outgoing boolean,
  req_incoming boolean,
  is_following boolean,
  is_blocked   boolean
)
language sql stable security definer
as $$
  with me as (select auth.uid() as id),
       t  as (select id from public.profiles where username = target_username)
  select
    t.id,
    exists(select 1 from public.friend_requests fr where fr.status = 'accepted'
      and ((fr.from_id = (select id from me) and fr.to_id = t.id)
        or (fr.from_id = t.id and fr.to_id = (select id from me)))),
    exists(select 1 from public.friend_requests fr where fr.status = 'pending'
      and fr.from_id = (select id from me) and fr.to_id = t.id),
    exists(select 1 from public.friend_requests fr where fr.status = 'pending'
      and fr.from_id = t.id and fr.to_id = (select id from me)),
    exists(select 1 from public.follows f
      where f.follower_id = (select id from me) and f.following_id = t.id),
    exists(select 1 from public.blocks b
      where b.blocker_id = (select id from me) and b.blocked_id = t.id)
  from t;
$$;

-- ── get_my_conversations now returns mute/pin and orders pinned first ────────
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
  other_last_seen    timestamptz,
  muted              boolean,
  pinned             boolean
)
language sql stable security definer
as $$
  select
    cp1.conversation_id, p.id, p.username, p.display_name, p.avatar_url,
    p.is_verified, p.status, p.last_seen, cp1.muted, cp1.pinned
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id and cp2.profile_id <> cp1.profile_id
  join public.profiles p on p.id = cp2.profile_id
  where cp1.profile_id = my_id and cp1.hidden = false
  order by cp1.pinned desc;
$$;
