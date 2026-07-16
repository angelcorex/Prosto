-- ── Emoji reactions on posts and messages ────────────────────────────────────
-- ADD_REACTIONS permission bit: 2048

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.post_reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
create index if not exists post_reactions_post_idx on public.post_reactions (post_id);

-- Covers both channel_messages and direct_messages (source discriminator).
create table if not exists public.message_reactions (
  message_id uuid not null,
  source     text not null check (source in ('channel', 'dm')),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (message_id, source, user_id, emoji)
);
create index if not exists message_reactions_msg_idx on public.message_reactions (message_id, source);

-- Enable RLS
alter table public.post_reactions enable row level security;
alter table public.message_reactions enable row level security;

-- RLS: anyone authenticated can read reactions
drop policy if exists "post_reactions: read" on public.post_reactions;
create policy "post_reactions: read" on public.post_reactions for select using (auth.uid() is not null);

drop policy if exists "message_reactions: read" on public.message_reactions;
create policy "message_reactions: read" on public.message_reactions for select using (auth.uid() is not null);

-- Enable realtime
alter table public.post_reactions    replica identity full;
alter table public.message_reactions replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'post_reactions'
  ) then
    alter publication supabase_realtime add table public.post_reactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end;
$$;

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Toggle an emoji reaction on a post. Returns true = added, false = removed.
create or replace function public.toggle_post_reaction(p_post uuid, p_emoji text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  already boolean;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if char_length(trim(p_emoji)) < 1 then raise exception 'empty emoji'; end if;
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'not found'; end if;
  select count(*) > 0 into already
    from public.post_reactions where post_id = p_post and user_id = me and emoji = p_emoji;
  if already then
    delete from public.post_reactions where post_id = p_post and user_id = me and emoji = p_emoji;
    return false;
  else
    insert into public.post_reactions (post_id, user_id, emoji) values (p_post, me, p_emoji)
      on conflict do nothing;
    return true;
  end if;
end;
$$;
grant execute on function public.toggle_post_reaction(uuid, text) to authenticated;

-- Get aggregated reactions for a post.
-- Returns: (emoji text, reaction_count int, reacted boolean)
create or replace function public.get_post_reactions(p_post uuid)
returns table(emoji text, reaction_count int, reacted boolean)
language sql stable security definer set search_path = public as $$
  select
    r.emoji,
    count(*)::int as reaction_count,
    bool_or(r.user_id = auth.uid()) as reacted
  from public.post_reactions r
  where r.post_id = p_post
  group by r.emoji
  order by min(r.created_at);
$$;
grant execute on function public.get_post_reactions(uuid) to authenticated, anon;

-- Toggle a reaction on a channel or DM message.
-- source: 'channel' | 'dm'
-- For channel messages checks ADD_REACTIONS (bit 2048) permission.
create or replace function public.toggle_message_reaction(p_message uuid, p_source text, p_emoji text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  already boolean;
  v_server uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if p_source not in ('channel', 'dm') then raise exception 'invalid source'; end if;
  if char_length(trim(p_emoji)) < 1 then raise exception 'empty emoji'; end if;

  if p_source = 'channel' then
    -- Verify user is a server member and has ADD_REACTIONS (2048).
    select ch.server_id into v_server
      from public.channel_messages cm
      join public.channels ch on ch.id = cm.channel_id
      where cm.id = p_message;
    if v_server is null then raise exception 'not found'; end if;
    if not public.is_server_member(v_server) then raise exception 'forbidden'; end if;
    if not (public.server_perms(v_server, me) & 2048 <> 0 or
            exists (select 1 from public.servers where id = v_server and owner_id = me)) then
      raise exception 'no permission';
    end if;
  else
    -- DM: verify user is a conversation participant.
    if not exists (
      select 1 from public.direct_messages dm
      join public.conversation_participants cp on cp.conversation_id = dm.conversation_id
      where dm.id = p_message and cp.profile_id = me
    ) then raise exception 'forbidden'; end if;
  end if;

  select count(*) > 0 into already
    from public.message_reactions
    where message_id = p_message and source = p_source and user_id = me and emoji = p_emoji;

  if already then
    delete from public.message_reactions
      where message_id = p_message and source = p_source and user_id = me and emoji = p_emoji;
    return false;
  else
    insert into public.message_reactions (message_id, source, user_id, emoji)
      values (p_message, p_source, me, p_emoji)
      on conflict do nothing;
    return true;
  end if;
end;
$$;
grant execute on function public.toggle_message_reaction(uuid, text, text) to authenticated;

-- Get aggregated reactions for a batch of messages.
create or replace function public.get_message_reactions(p_messages uuid[], p_source text)
returns table(message_id uuid, emoji text, reaction_count int, reacted boolean)
language sql stable security definer set search_path = public as $$
  select
    r.message_id,
    r.emoji,
    count(*)::int as reaction_count,
    bool_or(r.user_id = auth.uid()) as reacted
  from public.message_reactions r
  where r.message_id = any(p_messages) and r.source = p_source
  group by r.message_id, r.emoji
  order by r.message_id, min(r.created_at);
$$;
grant execute on function public.get_message_reactions(uuid[], text) to authenticated, anon;

-- ── ADD_REACTIONS permission (bit 2048) ──────────────────────────────────────
-- Grant it to all existing @everyone roles and update the _ensure_everyone default.

update public.server_roles
  set permissions = permissions | 2048
  where is_default = true and (permissions & 2048) = 0;

create or replace function public._ensure_everyone(p_server uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Default @everyone: READ_HISTORY(128)+USE_EMOJI(32)+SEND_MESSAGES(16)+CREATE_INVITE(8)+ADD_REACTIONS(2048) = 2232
  insert into public.server_roles (server_id, name, permissions, position, is_default)
  select p_server, '@everyone', 2232, 0, true
  where not exists (select 1 from public.server_roles where server_id = p_server and is_default);
end;
$$;
