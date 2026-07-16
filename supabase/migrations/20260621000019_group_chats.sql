-- Group chats (group DMs) — Discord-style.
-- Conversations gain group metadata and a routable public_id.

alter table public.conversations
  add column if not exists is_group   boolean not null default false,
  add column if not exists name       text,
  add column if not exists avatar_url text,
  add column if not exists owner_id   uuid references public.profiles(id) on delete set null,
  add column if not exists public_id  bigint;

alter table public.conversations alter column public_id set default public.gen_snowflake();
update public.conversations set public_id = public.gen_snowflake() where public_id is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_public_id_unique') then
    alter table public.conversations add constraint conversations_public_id_unique unique (public_id);
  end if;
end $$;

-- ── Create a group conversation with the caller + given members ──────────────
create or replace function public.create_group(member_ids uuid[], gname text default null, gavatar text default null)
returns text
language plpgsql
security definer
as $$
declare
  me   uuid   := auth.uid();
  conv uuid   := gen_random_uuid();
  pid  bigint := public.gen_snowflake();
  mid  uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  insert into public.conversations(id, is_group, name, avatar_url, owner_id, public_id)
  values (conv, true, nullif(trim(coalesce(gname, '')), ''), gavatar, me, pid);

  insert into public.conversation_participants(conversation_id, profile_id) values (conv, me);

  if member_ids is not null then
    foreach mid in array member_ids loop
      if mid <> me then
        insert into public.conversation_participants(conversation_id, profile_id)
        values (conv, mid) on conflict do nothing;
      end if;
    end loop;
  end if;

  return pid::text;
end;
$$;

-- ── Add members to an existing group ─────────────────────────────────────────
create or replace function public.add_group_members(conv uuid, member_ids uuid[])
returns void
language plpgsql
security definer
as $$
declare mid uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = conv and profile_id = auth.uid()) then
    raise exception 'not a participant';
  end if;
  foreach mid in array member_ids loop
    insert into public.conversation_participants(conversation_id, profile_id)
    values (conv, mid) on conflict do nothing;
  end loop;
end;
$$;

-- ── Rename / re-avatar a group ───────────────────────────────────────────────
create or replace function public.update_group(conv uuid, gname text, gavatar text)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.conversation_participants where conversation_id = conv and profile_id = auth.uid()) then
    raise exception 'not a participant';
  end if;
  update public.conversations set
    name       = coalesce(nullif(trim(coalesce(gname, '')), ''), name),
    avatar_url = coalesce(gavatar, avatar_url)
  where id = conv and is_group;
end;
$$;

-- ── Resolve a group by its public_id (caller must be a member) ───────────────
create or replace function public.get_group(gpid text)
returns table(conversation_id uuid, name text, avatar_url text, owner_id uuid, member_count int)
language sql
stable
security definer
as $$
  select c.id, c.name, c.avatar_url, c.owner_id,
    (select count(*) from public.conversation_participants cp2 where cp2.conversation_id = c.id)::int
  from public.conversations c
  where c.public_id::text = gpid and c.is_group
    and exists (select 1 from public.conversation_participants cp where cp.conversation_id = c.id and cp.profile_id = auth.uid());
$$;

-- ── List members of a conversation (caller must be a member) ─────────────────
create or replace function public.get_conversation_members(conv uuid)
returns table(
  id uuid, public_id text, username text, display_name text,
  avatar_url text, is_verified boolean, status text, last_seen timestamptz, is_owner boolean
)
language sql
stable
security definer
as $$
  select p.id, p.public_id::text, p.username, p.display_name, p.avatar_url, p.is_verified,
    p.status, p.last_seen, (c.owner_id = p.id)
  from public.conversation_participants cp
  join public.profiles p      on p.id = cp.profile_id
  join public.conversations c on c.id = cp.conversation_id
  where cp.conversation_id = conv
    and exists (select 1 from public.conversation_participants me where me.conversation_id = conv and me.profile_id = auth.uid())
  order by (c.owner_id = p.id) desc, p.username asc;
$$;

-- ── get_my_conversations now returns DMs *and* groups ────────────────────────
drop function if exists public.get_my_conversations(uuid);
create or replace function public.get_my_conversations(my_id uuid)
returns table(
  conversation_id    uuid,
  is_group           boolean,
  conv_public_id     text,
  group_name         text,
  group_avatar       text,
  member_count       int,
  other_id           uuid,
  other_public_id    text,
  other_username     text,
  other_display_name text,
  other_avatar_url   text,
  other_is_verified  boolean,
  other_status       text,
  other_last_seen    timestamptz,
  muted              boolean,
  pinned             boolean
)
language sql
stable
security definer
as $$
  select
    c.id,
    c.is_group,
    c.public_id::text,
    c.name,
    c.avatar_url,
    (select count(*) from public.conversation_participants cpc where cpc.conversation_id = c.id)::int,
    o.id, o.public_id::text, o.username, o.display_name, o.avatar_url, o.is_verified, o.status, o.last_seen,
    cp.muted, cp.pinned
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  left join lateral (
    select p.* from public.conversation_participants cp2
    join public.profiles p on p.id = cp2.profile_id
    where cp2.conversation_id = c.id and cp2.profile_id <> my_id
    limit 1
  ) o on (not c.is_group)
  where cp.profile_id = my_id and cp.hidden = false
  order by cp.pinned desc;
$$;

-- ── send_dm: skip the block check for group conversations ────────────────────
drop function if exists public.send_dm(uuid, text, uuid);
create or replace function public.send_dm(conv_id uuid, body text, reply uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  new_at timestamptz;
  is_grp boolean;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = conv_id and profile_id = me) then
    raise exception 'not a participant';
  end if;

  select is_group into is_grp from public.conversations where id = conv_id;

  if not coalesce(is_grp, false) and exists (
    select 1
    from public.conversation_participants cp
    join public.blocks b
      on (b.blocker_id = me and b.blocked_id = cp.profile_id)
      or (b.blocker_id = cp.profile_id and b.blocked_id = me)
    where cp.conversation_id = conv_id and cp.profile_id <> me
  ) then
    raise exception 'blocked';
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
