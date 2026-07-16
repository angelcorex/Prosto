-- Discord-style numeric public IDs + block-aware direct messages.

-- ── Snowflake-style ID generator (custom epoch = 2015-01-01) ─────────────────
create or replace function public.gen_snowflake()
returns bigint
language sql volatile
as $$
  select ((floor(extract(epoch from clock_timestamp()) * 1000)::bigint - 1420070400000) << 22)
       | (floor(random() * 4194304)::bigint);
$$;

-- ── profiles.public_id ───────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists public_id bigint;

update public.profiles
  set public_id = public.gen_snowflake()
  where public_id is null;

alter table public.profiles
  alter column public_id set default public.gen_snowflake();

alter table public.profiles
  alter column public_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_public_id_unique'
  ) then
    alter table public.profiles add constraint profiles_public_id_unique unique (public_id);
  end if;
end $$;

-- ── Relationship lookup now exposes the target public id + reverse block ─────
drop function if exists public.get_user_relationship(text);
create or replace function public.get_user_relationship(target_username text)
returns table(
  target_id        uuid,
  target_public_id text,
  is_friend        boolean,
  req_outgoing     boolean,
  req_incoming     boolean,
  is_following     boolean,
  is_blocked       boolean,
  blocked_by       boolean
)
language sql stable security definer
as $$
  with me as (select auth.uid() as id),
       t  as (select id, public_id from public.profiles where username = target_username)
  select
    t.id,
    t.public_id::text,
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
      where b.blocker_id = (select id from me) and b.blocked_id = t.id),
    exists(select 1 from public.blocks b
      where b.blocker_id = t.id and b.blocked_id = (select id from me))
  from t;
$$;

-- ── send_dm rejects messages when a block exists in either direction ─────────
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
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = conv_id and profile_id = me) then
    raise exception 'not a participant';
  end if;

  if exists (
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
