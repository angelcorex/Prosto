-- ─────────────────────────────────────────────────────────────────────────
-- Servers (Discord-style guilds): server → categories → text channels →
-- channel messages, plus members and reusable invite links. Each server and
-- channel has its own snowflake public id for short routes.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.servers (
  id         uuid primary key default gen_random_uuid(),
  public_id  bigint not null unique default public.gen_snowflake(),
  name       text not null check (char_length(name) between 1 and 60),
  icon_url   text,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id  uuid not null references public.servers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (server_id, profile_id)
);
create index if not exists server_members_profile_idx on public.server_members (profile_id);

create table if not exists public.server_categories (
  id         uuid primary key default gen_random_uuid(),
  server_id  uuid not null references public.servers(id) on delete cascade,
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.server_channels (
  id          uuid primary key default gen_random_uuid(),
  public_id   bigint not null unique default public.gen_snowflake(),
  server_id   uuid not null references public.servers(id) on delete cascade,
  category_id uuid references public.server_categories(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 60),
  type        text not null default 'text' check (type in ('text')),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists server_channels_server_idx on public.server_channels (server_id);

create table if not exists public.channel_messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.server_channels(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 2000),
  reply_to   uuid references public.channel_messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists channel_messages_idx on public.channel_messages (channel_id, created_at);

create table if not exists public.server_invites (
  token      text primary key,
  server_id  uuid not null references public.servers(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists server_invites_server_idx on public.server_invites (server_id);

-- ── Helpers ──
create or replace function public.is_server_member(srv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.server_members where server_id = srv and profile_id = auth.uid());
$$;

create or replace function public.is_channel_member(ch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.server_channels sc
    join public.server_members sm on sm.server_id = sc.server_id
    where sc.id = ch and sm.profile_id = auth.uid()
  );
$$;

-- ── RLS ──
alter table public.servers            enable row level security;
alter table public.server_members     enable row level security;
alter table public.server_categories  enable row level security;
alter table public.server_channels    enable row level security;
alter table public.channel_messages   enable row level security;
alter table public.server_invites     enable row level security;

create policy "servers: members read"   on public.servers           for select using (public.is_server_member(id));
create policy "members: read own server" on public.server_members    for select using (public.is_server_member(server_id));
create policy "categories: members read" on public.server_categories for select using (public.is_server_member(server_id));
create policy "channels: members read"   on public.server_channels   for select using (public.is_server_member(server_id));
create policy "messages: members read"   on public.channel_messages  for select using (public.is_channel_member(channel_id));

-- Realtime for live channel messages.
alter table public.channel_messages replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.channel_messages; exception when duplicate_object then null; end;
end $$;
