-- ── Follows ────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;
create policy "Follows viewable by everyone"   on public.follows for select using (true);
create policy "Users can follow others"         on public.follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow"              on public.follows for delete using (auth.uid() = follower_id);

-- ── Friend requests ────────────────────────────────────────────────────────
create table if not exists public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.profiles(id) on delete cascade,
  to_id       uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at  timestamptz not null default now(),
  constraint no_self_friend check (from_id <> to_id),
  unique (from_id, to_id)
);

create index friend_requests_to_idx on public.friend_requests (to_id, status);

alter table public.friend_requests enable row level security;
create policy "Friend requests visible to participants"
  on public.friend_requests for select
  using (auth.uid() = from_id or auth.uid() = to_id);
create policy "Users can send friend requests"
  on public.friend_requests for insert
  with check (auth.uid() = from_id);
create policy "Recipient can update status"
  on public.friend_requests for update
  using (auth.uid() = to_id);
create policy "Participants can delete"
  on public.friend_requests for delete
  using (auth.uid() = from_id or auth.uid() = to_id);

-- ── Notifications ──────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('follow','friend_request','friend_accepted','message')),
  actor_id    uuid references public.profiles(id) on delete set null,
  ref_id      uuid,          -- e.g. friend_request id
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

alter table public.notifications enable row level security;
create policy "Users see own notifications"
  on public.notifications for select using (auth.uid() = user_id);
create policy "System can insert notifications"
  on public.notifications for insert with check (true);
create policy "Users can mark read"
  on public.notifications for update using (auth.uid() = user_id);

-- ── Conversations ──────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

alter table public.conversations enable row level security;

-- Participants join table
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, profile_id)
);

alter table public.conversation_participants enable row level security;
create policy "Participants can view their conversations"
  on public.conversation_participants for select
  using (auth.uid() = profile_id);
create policy "Can join conversation"
  on public.conversation_participants for insert
  with check (true);

create policy "Conversations viewable by participants"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = id and cp.profile_id = auth.uid()
    )
  );
create policy "Anyone can create a conversation"
  on public.conversations for insert with check (true);

-- ── Direct messages ────────────────────────────────────────────────────────
create table if not exists public.direct_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  content         text not null check (char_length(content) >= 1 and char_length(content) <= 2000),
  created_at      timestamptz not null default now()
);

create index dm_conversation_idx on public.direct_messages (conversation_id, created_at asc);

alter table public.direct_messages enable row level security;
create policy "Participants can read messages"
  on public.direct_messages for select
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = direct_messages.conversation_id
        and cp.profile_id = auth.uid()
    )
  );
create policy "Participants can send messages"
  on public.direct_messages for insert
  with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_id and cp.profile_id = auth.uid()
    )
  );

-- ── Follower/following counts (denormalised view) ──────────────────────────
create or replace view public.profile_stats as
select
  p.id,
  count(distinct f1.follower_id)  as followers_count,
  count(distinct f2.following_id) as following_count
from public.profiles p
left join public.follows f1 on f1.following_id = p.id
left join public.follows f2 on f2.follower_id  = p.id
group by p.id;
