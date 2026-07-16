-- ─────────────────────────────────────────────────────────────────────────
-- Bot platform: developer-owned bot accounts, opaque API tokens, slash
-- commands, and a slash-command interaction queue (long-polling delivery).
--
-- Design (see [[bot-platform]]):
--   A bot IS a profile (profiles.is_bot = true), backed by an auth.users row
--   created server-side via the service-role admin API. This lets bots reuse
--   the ENTIRE existing stack — server membership, channel_perms, message
--   rendering, mentions, blocks — instead of a parallel implementation.
--
-- Security posture (see [[security-model]] / [[security-hardening]]): the
-- browser holds the anon key and can call PostgREST directly, so RLS is the
-- real boundary. Bot-privileged RPCs (bot_send_*, bot_poll_*, bot_reply_*) are
-- EXECUTE-granted ONLY to service_role — they take an explicit p_bot actor and
-- are called by the API *after* it has verified the bearer token. Clients can
-- never call them (revoked from anon/authenticated). Token PLAINTEXT is never
-- stored — only a SHA-256 hash — and is shown to the developer exactly once.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Profile flags ───────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_bot       boolean not null default false,
  add column if not exists bot_owner_id uuid references public.profiles(id) on delete cascade;

create index if not exists profiles_bot_owner_idx on public.profiles (bot_owner_id) where is_bot;

-- ── bots: per-bot metadata (profile row carries name/username/avatar) ────────
create table if not exists public.bots (
  id          uuid primary key references public.profiles(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  disabled_at timestamptz
);
create index if not exists bots_owner_idx on public.bots (owner_id, created_at desc);

alter table public.bots enable row level security;
drop policy if exists "bots readable by owner" on public.bots;
create policy "bots readable by owner" on public.bots
  for select using (owner_id = auth.uid());
-- No client write policies: all mutation goes through SECURITY DEFINER RPCs /
-- the service-role admin client.

-- ── bot_tokens: hashed API credentials (plaintext shown once, never stored) ──
create table if not exists public.bot_tokens (
  id           uuid primary key default gen_random_uuid(),
  bot_id       uuid not null references public.bots(id) on delete cascade,
  token_hash   text not null,               -- sha256(secret[+pepper]) hex
  token_prefix text not null,               -- display hint, e.g. 'pb_1a2b…'
  name         text,                         -- optional developer label
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create unique index if not exists bot_tokens_hash_idx on public.bot_tokens (token_hash);
create index if not exists bot_tokens_bot_idx on public.bot_tokens (bot_id, created_at desc);

alter table public.bot_tokens enable row level security;
drop policy if exists "tokens readable by bot owner" on public.bot_tokens;
create policy "tokens readable by bot owner" on public.bot_tokens
  for select using (
    exists (select 1 from public.bots b where b.id = bot_tokens.bot_id and b.owner_id = auth.uid())
  );
-- token_hash is never needed client-side; the metadata (prefix/last_used) is the
-- only useful bit and is owner-scoped. No write policies (definer/service-role).

-- ── bot_commands: slash-command definitions ─────────────────────────────────
create table if not exists public.bot_commands (
  id          uuid primary key default gen_random_uuid(),
  bot_id      uuid not null references public.bots(id) on delete cascade,
  name        text not null,                 -- ^[a-z][a-z0-9_-]{0,31}$
  description text not null default '',
  options     jsonb not null default '[]'::jsonb,  -- [{name,description,type,required}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (bot_id, name),
  constraint bot_command_name_format check (name ~ '^[a-z][a-z0-9_-]{0,31}$')
);
create index if not exists bot_commands_bot_idx on public.bot_commands (bot_id);

alter table public.bot_commands enable row level security;
drop policy if exists "commands readable by all" on public.bot_commands;
-- Command definitions are public metadata (needed to render the slash palette
-- to any user who shares a channel/DM with the bot). Names/descriptions only.
create policy "commands readable by all" on public.bot_commands
  for select using (true);
-- No write policies (definer RPC).

-- ── bot_interactions: slash-command invocation queue (long-poll delivery) ────
-- One row per /command a user runs. The bot claims pending rows via
-- bot_poll_interactions (FOR UPDATE SKIP LOCKED), then answers exactly once via
-- bot_reply_interaction using the single-use response_token. Rows expire so a
-- dead bot can't leave a command hanging forever.
create table if not exists public.bot_interactions (
  id             uuid primary key default gen_random_uuid(),
  bot_id         uuid not null references public.bots(id) on delete cascade,
  command_id     uuid references public.bot_commands(id) on delete set null,
  command_name   text not null,
  invoker_id     uuid not null references public.profiles(id) on delete cascade,
  scope          text not null check (scope in ('channel', 'dm')),
  channel_id     uuid references public.server_channels(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  server_id      uuid references public.servers(id) on delete cascade,
  options        jsonb not null default '{}'::jsonb,
  status         text not null default 'pending'
                 check (status in ('pending', 'delivered', 'responded', 'expired')),
  response_token uuid not null default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  delivered_at   timestamptz,
  responded_at   timestamptz,
  expires_at     timestamptz not null default (now() + interval '15 minutes'),
  -- Exactly one target must be set for the scope.
  constraint interaction_target check (
    (scope = 'channel' and channel_id is not null and conversation_id is null) or
    (scope = 'dm'      and conversation_id is not null and channel_id is null)
  )
);
create index if not exists bot_interactions_poll_idx
  on public.bot_interactions (bot_id, status, created_at)
  where status = 'pending';
create unique index if not exists bot_interactions_token_idx
  on public.bot_interactions (response_token);
create index if not exists bot_interactions_invoker_idx
  on public.bot_interactions (invoker_id, created_at desc);

alter table public.bot_interactions enable row level security;
-- No client policies at all: interactions are created/read/answered exclusively
-- through SECURITY DEFINER RPCs (create_interaction by the invoker's session;
-- bot_poll/bot_reply by the service-role API). Nothing reads this table directly.

-- ─────────────────────────────────────────────────────────────────────────
-- Extend the message readers with sender_is_bot so the UI can badge bot
-- messages. Signatures/columns are otherwise identical to migration 120 — the
-- new column is appended so existing callers keep working.
-- ─────────────────────────────────────────────────────────────────────────
-- Return type changes (new sender_is_bot column) → must DROP first; Postgres
-- refuses to `create or replace` a function whose OUT columns differ.
drop function if exists public.get_channel_messages(uuid);
create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  edited_at timestamptz, pinned_at timestamptz, pinned_by uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean, sender_is_premium boolean,
  sender_role_color text, sender_role_color2 text, sender_role_glow text, sender_role_icon text,
  sender_is_bot boolean)
language sql stable security definer set search_path = public as $$
  select id, content, created_at, sender_id, reply_to,
    edited_at, pinned_at, pinned_by,
    sender_username, sender_display_name, sender_avatar_url,
    sender_is_verified, sender_is_moderator, sender_is_premium,
    sender_role_color, sender_role_color2, sender_role_glow, sender_role_icon,
    sender_is_bot
  from (
    select m.id, m.content, m.created_at, m.sender_id, m.reply_to,
      m.edited_at, m.pinned_at, m.pinned_by,
      p.username as sender_username, p.display_name as sender_display_name,
      p.avatar_url as sender_avatar_url, p.is_verified as sender_is_verified,
      p.is_moderator as sender_is_moderator, p.is_premium as sender_is_premium,
      (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
         where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
         order by r.position desc limit 1) as sender_role_color,
      (select r.color2 from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
         where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
         order by r.position desc limit 1) as sender_role_color2,
      (select r.glow from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
         where mr.profile_id = p.id and mr.server_id = sc.server_id and r.glow is not null
         order by r.position desc limit 1) as sender_role_glow,
      (select r.icon_url from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
         where mr.profile_id = p.id and mr.server_id = sc.server_id and r.icon_url is not null
         order by r.position desc limit 1) as sender_role_icon,
      p.is_bot as sender_is_bot
    from public.channel_messages m
    join public.profiles p on p.id = m.sender_id
    join public.server_channels sc on sc.id = m.channel_id
    where m.channel_id = p_channel
      and public.is_channel_member(p_channel)
      and (public.channel_perms(p_channel, auth.uid()) & 128) <> 0
    order by m.created_at desc
    limit 200
  ) recent
  order by created_at asc;
$$;
-- Signature changed (added a column) so re-grant to the same roles as before.
grant execute on function public.get_channel_messages(uuid) to authenticated;

drop function if exists public.get_conversation_messages(uuid);
create or replace function public.get_conversation_messages(conv uuid)
returns table(
  id uuid, content text, created_at timestamptz, sender_id uuid, type text, call_seconds int, reply_to uuid,
  edited_at timestamptz, pinned_at timestamptz, pinned_by uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean, sender_is_premium boolean,
  sender_is_bot boolean
)
language sql stable security definer set search_path = public as $$
  select id, content, created_at, sender_id, type, call_seconds, reply_to,
    edited_at, pinned_at, pinned_by,
    sender_username, sender_display_name, sender_avatar_url,
    sender_is_verified, sender_is_moderator, sender_is_premium, sender_is_bot
  from (
    select
      m.id, m.content, m.created_at, m.sender_id, m.type, m.call_seconds, m.reply_to,
      m.edited_at, m.pinned_at, m.pinned_by,
      p.username as sender_username, p.display_name as sender_display_name,
      p.avatar_url as sender_avatar_url, p.is_verified as sender_is_verified,
      p.is_moderator as sender_is_moderator, p.is_premium as sender_is_premium,
      p.is_bot as sender_is_bot
    from public.direct_messages m
    join public.profiles p on p.id = m.sender_id
    where m.conversation_id = conv
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = conv and cp.profile_id = auth.uid()
      )
    order by m.created_at desc
    limit 200
  ) recent
  order by created_at asc;
$$;
grant execute on function public.get_conversation_messages(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- BOT-PRIVILEGED RPCs.
-- These take an explicit p_bot actor (there is no auth.uid() for an API
-- request) and are EXECUTE-granted ONLY to service_role. The API calls them
-- through the service-role client AFTER verifying the bearer token, so p_bot is
-- trusted. Each still re-checks membership + permissions so a bot has no more
-- power than a normal member.
-- ─────────────────────────────────────────────────────────────────────────

-- Send a message to a server channel AS the bot. Mirrors send_channel_message's
-- checks (membership, SEND_MESSAGES perm bit 16, char limit) but uses the
-- explicit bot actor and a bot-scoped rate limit.
create or replace function public.bot_send_channel_message(
  p_bot uuid, p_channel uuid, body text, reply uuid default null
)
returns table (msg_id uuid, msg_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare srv uuid; cperms bigint; v_id uuid; v_at timestamptz;
begin
  if not exists (select 1 from public.bots b where b.id = p_bot and b.is_active) then
    raise exception 'bot_inactive';
  end if;

  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.server_members sm where sm.server_id = srv and sm.profile_id = p_bot) then
    raise exception 'forbidden';
  end if;

  cperms := public.channel_perms(p_channel, p_bot);
  if (cperms & 16) = 0 then raise exception 'forbidden'; end if;

  -- Per-bot rate limiting is enforced in the API layer (authenticateBot): the
  -- DB check_rate_limit keys off auth.uid(), which is null for a service-role
  -- bot call, so it can't be used here.

  body := trim(body);
  if body = '' or char_length(body) > 4000 then raise exception 'invalid content'; end if;

  insert into public.channel_messages (channel_id, sender_id, content, reply_to)
  values (p_channel, p_bot, body, reply)
  returning channel_messages.id, channel_messages.created_at into v_id, v_at;

  msg_id := v_id; msg_created_at := v_at; return next;
end;
$$;
revoke all on function public.bot_send_channel_message(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.bot_send_channel_message(uuid, uuid, text, uuid) to service_role;

-- Send a DM as the bot. The bot must already be a participant of the
-- conversation (created when a user opens a DM with the bot).
create or replace function public.bot_send_dm(
  p_bot uuid, conv_id uuid, body text, reply uuid default null
)
returns table (id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; new_at timestamptz;
begin
  if not exists (select 1 from public.bots b where b.id = p_bot and b.is_active) then
    raise exception 'bot_inactive';
  end if;
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and profile_id = p_bot
  ) then raise exception 'not a participant'; end if;

  -- Per-bot rate limiting is enforced in the API layer (see bot_send_channel_message).

  body := trim(body);
  if body = '' or char_length(body) > 4000 then raise exception 'invalid content'; end if;

  insert into public.direct_messages (conversation_id, sender_id, content, reply_to)
  values (conv_id, p_bot, body, reply)
  returning direct_messages.id, direct_messages.created_at into new_id, new_at;

  update public.conversation_participants set hidden = false where conversation_id = conv_id;

  insert into public.notifications (user_id, type, actor_id, ref_id)
  select profile_id, 'message', p_bot, conv_id
  from public.conversation_participants
  where conversation_id = conv_id and profile_id <> p_bot;

  id := new_id; created_at := new_at; return next;
end;
$$;
revoke all on function public.bot_send_dm(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.bot_send_dm(uuid, uuid, text, uuid) to service_role;

-- Claim up to p_limit pending interactions for the bot (long-poll). Uses
-- FOR UPDATE SKIP LOCKED so concurrent pollers never hand the same interaction
-- twice, and flips claimed rows to 'delivered'. Also lazily expires stale rows.
create or replace function public.bot_poll_interactions(p_bot uuid, p_limit int default 10)
returns table (
  id uuid, command_name text, invoker_id uuid, invoker_username text,
  scope text, channel_id uuid, conversation_id uuid, server_id uuid,
  options jsonb, response_token uuid, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  -- Expire anything past its deadline first (idempotent, cheap via partial idx).
  update public.bot_interactions
     set status = 'expired'
   where bot_id = p_bot and status in ('pending', 'delivered') and expires_at < now();

  return query
  with claimed as (
    select bi.id
    from public.bot_interactions bi
    where bi.bot_id = p_bot and bi.status = 'pending'
    order by bi.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), upd as (
    update public.bot_interactions bi
       set status = 'delivered', delivered_at = now()
      from claimed
     where bi.id = claimed.id
    returning bi.*
  )
  select u.id, u.command_name, u.invoker_id, p.username,
         u.scope, u.channel_id, u.conversation_id, u.server_id,
         u.options, u.response_token, u.created_at
  from upd u
  join public.profiles p on p.id = u.invoker_id
  order by u.created_at;
end;
$$;
revoke all on function public.bot_poll_interactions(uuid, int) from public, anon, authenticated;
grant execute on function public.bot_poll_interactions(uuid, int) to service_role;

-- Answer an interaction exactly once via its single-use response_token. Posts
-- the reply to the originating channel/DM as the bot and marks it 'responded'.
create or replace function public.bot_reply_interaction(
  p_bot uuid, p_token uuid, body text
)
returns table (msg_id uuid, msg_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare it public.bot_interactions; v_id uuid; v_at timestamptz;
begin
  select * into it from public.bot_interactions
   where response_token = p_token and bot_id = p_bot
   for update;
  if it.id is null then raise exception 'unknown_interaction'; end if;
  if it.status = 'responded' then raise exception 'already_responded'; end if;
  if it.status = 'expired' or it.expires_at < now() then raise exception 'interaction_expired'; end if;

  if it.scope = 'channel' then
    select b.msg_id, b.msg_created_at into v_id, v_at
      from public.bot_send_channel_message(p_bot, it.channel_id, body, null) b;
  else
    select d.id, d.created_at into v_id, v_at
      from public.bot_send_dm(p_bot, it.conversation_id, body, null) d;
  end if;

  update public.bot_interactions
     set status = 'responded', responded_at = now()
   where id = it.id;

  msg_id := v_id; msg_created_at := v_at; return next;
end;
$$;
revoke all on function public.bot_reply_interaction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bot_reply_interaction(uuid, uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- USER / OWNER RPCs (granted to `authenticated`; authorization inside).
-- ─────────────────────────────────────────────────────────────────────────

-- Run a slash command: create a pending interaction the bot will pick up. The
-- INVOKER's own session calls this, so auth.uid() is the human. We verify the
-- bot is reachable from where the command is being run (shares the channel's
-- server, or is a participant of the DM) and that the command exists — this is
-- the authorization gate that stops a user driving a bot they can't see.
create or replace function public.create_interaction(
  p_bot uuid, p_command text, p_scope text,
  p_channel uuid default null, p_conversation uuid default null,
  p_options jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_srv uuid; v_cmd uuid; v_id uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.bots b where b.id = p_bot and b.is_active) then
    raise exception 'bot_unavailable';
  end if;

  select id into v_cmd from public.bot_commands where bot_id = p_bot and name = p_command;
  if v_cmd is null then raise exception 'unknown_command'; end if;

  -- Cheap abuse guard: cap how fast one user can fire slash commands.
  perform public.check_rate_limit('interaction', 20, 60);

  if p_scope = 'channel' then
    if p_channel is null then raise exception 'invalid target'; end if;
    -- The invoker must be able to see/use the channel...
    if not public.is_channel_member(p_channel) then raise exception 'forbidden'; end if;
    if (public.channel_perms(p_channel, me) & 16) = 0 then raise exception 'forbidden'; end if;
    -- ...and the bot must be a member of that channel's server.
    select sc.server_id into v_srv from public.server_channels sc where sc.id = p_channel;
    if v_srv is null or not exists (
      select 1 from public.server_members sm where sm.server_id = v_srv and sm.profile_id = p_bot
    ) then raise exception 'bot_not_in_server'; end if;
    -- ...AND the bot itself must be able to send here. Without this the command
    -- is accepted, the bot's handler runs, but bot_send_channel_message then
    -- raises 'forbidden' (403) at reply time — a doomed interaction. Reject it
    -- up front with a distinct code so the invoker gets a clear ephemeral reason.
    if (public.channel_perms(p_channel, p_bot) & 16) = 0 then raise exception 'bot_cannot_send'; end if;

    insert into public.bot_interactions (bot_id, command_id, command_name, invoker_id, scope, channel_id, server_id, options)
    values (p_bot, v_cmd, p_command, me, 'channel', p_channel, v_srv, coalesce(p_options, '{}'::jsonb))
    returning id into v_id;

  elsif p_scope = 'dm' then
    if p_conversation is null then raise exception 'invalid target'; end if;
    -- Both the invoker AND the bot must be participants of the conversation.
    if not exists (
      select 1 from public.conversation_participants where conversation_id = p_conversation and profile_id = me
    ) then raise exception 'forbidden'; end if;
    if not exists (
      select 1 from public.conversation_participants where conversation_id = p_conversation and profile_id = p_bot
    ) then raise exception 'bot_not_in_dm'; end if;

    insert into public.bot_interactions (bot_id, command_id, command_name, invoker_id, scope, conversation_id, options)
    values (p_bot, v_cmd, p_command, me, 'dm', p_conversation, coalesce(p_options, '{}'::jsonb))
    returning id into v_id;
  else
    raise exception 'invalid scope';
  end if;

  return v_id;
end;
$$;
grant execute on function public.create_interaction(uuid, text, text, uuid, uuid, jsonb) to authenticated;

-- List the bots I own, with token counts + basic profile info for the portal.
create or replace function public.list_my_bots()
returns table (
  id uuid, username text, display_name text, avatar_url text,
  description text, is_active boolean, command_count int, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, p.username, p.display_name, p.avatar_url,
         b.description, b.is_active,
         (select count(*)::int from public.bot_commands c where c.bot_id = b.id) as command_count,
         b.created_at
  from public.bots b
  join public.profiles p on p.id = b.id
  where b.owner_id = auth.uid()
  order by b.created_at desc;
$$;
grant execute on function public.list_my_bots() to authenticated;

-- Commands available to the invoker in a given channel or DM — used to render
-- the slash palette. Only returns commands for bots actually present there.
create or replace function public.get_available_commands(
  p_scope text, p_channel uuid default null, p_conversation uuid default null
)
returns table (
  bot_id uuid, bot_username text, bot_display_name text, bot_avatar_url text,
  command_name text, description text, options jsonb
)
language sql stable security definer set search_path = public as $$
  select b.id, p.username, p.display_name, p.avatar_url,
         c.name, c.description, c.options
  from public.bots b
  join public.profiles p on p.id = b.id
  join public.bot_commands c on c.bot_id = b.id
  where b.is_active
    and (
      (p_scope = 'channel' and p_channel is not null
        and public.is_channel_member(p_channel)
        and exists (
          select 1 from public.server_channels sc
          join public.server_members sm on sm.server_id = sc.server_id and sm.profile_id = b.id
          where sc.id = p_channel
        ))
      or
      (p_scope = 'dm' and p_conversation is not null
        and exists (select 1 from public.conversation_participants cp
                    where cp.conversation_id = p_conversation and cp.profile_id = auth.uid())
        and exists (select 1 from public.conversation_participants cp
                    where cp.conversation_id = p_conversation and cp.profile_id = b.id))
    )
  order by p.username, c.name;
$$;
grant execute on function public.get_available_commands(text, uuid, uuid) to authenticated;

-- Add a bot I own to a server I own (or where I have MANAGE_SERVER, bit 2048).
-- Inserting into server_members is all that's needed — a bot is a profile.
create or replace function public.add_bot_to_server(p_bot uuid, p_server uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.bots b where b.id = p_bot and b.owner_id = me) then
    raise exception 'not_your_bot';
  end if;
  -- Owner or MANAGE_SERVER may add bots.
  if not exists (select 1 from public.servers s where s.id = p_server and s.owner_id = me)
     and (public.server_perms(p_server, me) & 2048) = 0 then
    raise exception 'forbidden';
  end if;
  insert into public.server_members (server_id, profile_id)
  values (p_server, p_bot) on conflict do nothing;
end;
$$;
grant execute on function public.add_bot_to_server(uuid, uuid) to authenticated;

-- Remove a bot I own from a server.
create or replace function public.remove_bot_from_server(p_bot uuid, p_server uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.bots b where b.id = p_bot and b.owner_id = me)
     and not exists (select 1 from public.servers s where s.id = p_server and s.owner_id = me)
     and (public.server_perms(p_server, me) & 2048) = 0 then
    raise exception 'forbidden';
  end if;
  delete from public.server_members where server_id = p_server and profile_id = p_bot;
end;
$$;
grant execute on function public.remove_bot_from_server(uuid, uuid) to authenticated;

-- Upsert a slash command for a bot I own.
create or replace function public.upsert_bot_command(
  p_bot uuid, p_name text, p_description text default '', p_options jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.bots b where b.id = p_bot and b.owner_id = me) then
    raise exception 'not_your_bot';
  end if;
  if p_name !~ '^[a-z][a-z0-9_-]{0,31}$' then raise exception 'invalid_command_name'; end if;

  insert into public.bot_commands (bot_id, name, description, options)
  values (p_bot, p_name, coalesce(p_description, ''), coalesce(p_options, '[]'::jsonb))
  on conflict (bot_id, name)
    do update set description = excluded.description, options = excluded.options, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.upsert_bot_command(uuid, text, text, jsonb) to authenticated;

-- Delete a slash command for a bot I own.
create or replace function public.delete_bot_command(p_bot uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.bots b where b.id = p_bot and b.owner_id = me) then
    raise exception 'not_your_bot';
  end if;
  delete from public.bot_commands where bot_id = p_bot and name = p_name;
end;
$$;
grant execute on function public.delete_bot_command(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Surface is_bot in the server member list so the UI can render the BOT badge
-- next to a bot member's name (same as message authorship). Return type changes
-- (new is_bot column) → DROP first. Otherwise identical to migration 099.
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.get_server_members(uuid);
create or replace function public.get_server_members(p_server uuid)
returns table(id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, is_moderator boolean, is_premium boolean, status text, last_seen timestamptz, is_owner boolean,
  role_color text, role_color2 text, role_glow text, role_icon text,
  hoist_role_id uuid, hoist_role_name text, hoist_role_pos int, timeout_until timestamptz,
  is_bot boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium,
    p.status, p.last_seen, (s.owner_id = p.id),
    (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.color is not null
       order by r.position desc limit 1),
    (select r.color2 from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.color is not null
       order by r.position desc limit 1),
    (select r.glow from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.glow is not null
       order by r.position desc limit 1),
    (select r.icon_url from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.icon_url is not null
       order by r.position desc limit 1),
    (select r.id from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.hoist
       order by r.position desc limit 1),
    (select r.name from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.hoist
       order by r.position desc limit 1),
    (select r.position from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = p_server and r.hoist
       order by r.position desc limit 1),
    sm.timeout_until,
    p.is_bot
  from public.server_members sm
  join public.profiles p on p.id = sm.profile_id
  join public.servers s on s.id = sm.server_id
  where sm.server_id = p_server and public.is_server_member(p_server)
  order by (s.owner_id = p.id) desc, p.username asc;
$$;
grant execute on function public.get_server_members(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- A bot is not a social actor: you can't follow it or friend it. Enforce this
-- at the DATA layer so it holds regardless of which UI surface tries — the
-- profile page, context menus, or a hand-rolled PostgREST call.
-- ─────────────────────────────────────────────────────────────────────────

-- Following: `follows` is a direct client insert (RLS-gated). Tighten the
-- insert policy so the target can't be a bot.
drop policy if exists "Users can follow others" on public.follows;
create policy "Users can follow others" on public.follows for insert
  with check (
    auth.uid() = follower_id
    and not exists (select 1 from public.profiles p where p.id = following_id and p.is_bot)
  );

-- Friend requests: guard inside the definer RPC (re-assert the whole function
-- from migration 117, adding a bot check right after the self/null guard).
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null or target is null or me = target then return 'noop'; end if;

  -- Bots can't be friended.
  if exists (select 1 from public.profiles p where p.id = target and p.is_bot) then
    raise exception 'not_allowed';
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = me and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = me)
  ) then raise exception 'blocked'; end if;

  if not public.passes_privacy(me, target,
      (select privacy_friend_req from public.profiles where id = target)) then
    raise exception 'not_allowed';
  end if;

  if exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.from_id = me and fr.to_id = target) or (fr.from_id = target and fr.to_id = me))
  ) then return 'already'; end if;

  insert into public.friend_requests (from_id, to_id, status)
  values (me, target, 'pending')
  on conflict (from_id, to_id) do update set status = 'pending'
  where public.friend_requests.status <> 'accepted';

  insert into public.notifications (user_id, type, actor_id, ref_id)
  values (target, 'friend_request', me, me)
  on conflict do nothing;

  return 'sent';
end;
$$;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Surface is_bot for group-DM participants so a bot added to a group chat gets
-- the BOT badge in the members panel too. Return-type change → DROP first.
-- Otherwise identical to migration 089.
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.get_conversation_members(uuid);
create or replace function public.get_conversation_members(conv uuid)
returns table(
  id uuid, public_id text, username text, display_name text,
  avatar_url text, is_verified boolean, is_moderator boolean, is_premium boolean,
  status text, last_seen timestamptz, is_owner boolean, is_bot boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.public_id::text, p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium,
    p.status, p.last_seen, (c.owner_id = p.id), p.is_bot
  from public.conversation_participants cp
  join public.profiles p      on p.id = cp.profile_id
  join public.conversations c on c.id = cp.conversation_id
  where cp.conversation_id = conv
    and exists (select 1 from public.conversation_participants me where me.conversation_id = conv and me.profile_id = auth.uid())
  order by (c.owner_id = p.id) desc, p.username asc;
$$;
grant execute on function public.get_conversation_members(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Surface is_bot for the OTHER participant in the DM list, so a 1:1 chat with a
-- bot shows the BOT badge there too. Return-type change → DROP first. Otherwise
-- identical to migration 119.
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.get_my_conversations(uuid);
create or replace function public.get_my_conversations(my_id uuid)
returns table(
  conversation_id uuid, is_group boolean, conv_public_id text, group_name text, group_avatar text,
  member_count int, other_id uuid, other_public_id text, other_username text, other_display_name text,
  other_avatar_url text, other_is_verified boolean, other_is_moderator boolean, other_is_premium boolean,
  other_status text, other_last_seen timestamptz, other_custom_status text,
  muted boolean, pinned boolean, unread_count int, other_is_bot boolean
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.is_group, c.public_id::text, c.name, c.avatar_url,
    (select count(*) from public.conversation_participants cpc where cpc.conversation_id = c.id)::int,
    o.id, o.public_id::text, o.username, o.display_name, o.avatar_url, o.is_verified, o.is_moderator, o.is_premium,
    o.status, o.last_seen, o.custom_status,
    cp.muted, cp.pinned,
    (
      select count(*)
      from public.direct_messages dm
      where dm.conversation_id = c.id
        and dm.sender_id <> my_id
        and coalesce(dm.type, 'text') <> 'system'
        and dm.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz)
    )::int as unread_count,
    o.is_bot
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  left join lateral (
    select p.* from public.conversation_participants cp2
    join public.profiles p on p.id = cp2.profile_id
    where cp2.conversation_id = c.id and cp2.profile_id <> my_id
    limit 1
  ) o on (not c.is_group)
  where cp.profile_id = my_id and cp.hidden = false
  order by
    cp.pinned desc,
    coalesce(
      (select max(dm.created_at) from public.direct_messages dm where dm.conversation_id = c.id),
      c.created_at
    ) desc;
$$;
grant execute on function public.get_my_conversations(uuid) to authenticated;
