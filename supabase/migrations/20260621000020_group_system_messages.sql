-- Group system messages: created / renamed / avatar / members added.
-- These render as centered timeline events (like call messages) and, because
-- they are real rows in direct_messages, they broadcast over realtime so every
-- member instantly sees group activity.

alter table public.direct_messages drop constraint if exists direct_messages_type_check;
alter table public.direct_messages
  add constraint direct_messages_type_check check (type in ('text', 'call', 'system'));

-- Allow empty content for system messages (the code lives in `content`).
-- (No length change needed — codes are short strings.)

-- ── create_group: also drop a "created the group" system message ─────────────
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

  insert into public.direct_messages(conversation_id, sender_id, content, type)
  values (conv, me, 'group_create', 'system');

  return pid::text;
end;
$$;

-- ── add_group_members: system message per added member ───────────────────────
create or replace function public.add_group_members(conv uuid, member_ids uuid[])
returns void
language plpgsql
security definer
as $$
declare
  mid uuid;
  uname text;
  inserted boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = conv and profile_id = auth.uid()) then
    raise exception 'not a participant';
  end if;
  foreach mid in array member_ids loop
    insert into public.conversation_participants(conversation_id, profile_id)
    values (conv, mid) on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted then
      select username into uname from public.profiles where id = mid;
      insert into public.direct_messages(conversation_id, sender_id, content, type)
      values (conv, auth.uid(), 'group_add:' || coalesce(uname, ''), 'system');
    end if;
  end loop;
end;
$$;

-- ── update_group: system message for rename / avatar change ──────────────────
create or replace function public.update_group(conv uuid, gname text, gavatar text)
returns void
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  old_name text;
  new_name text;
begin
  if not exists (select 1 from public.conversation_participants where conversation_id = conv and profile_id = me) then
    raise exception 'not a participant';
  end if;

  select name into old_name from public.conversations where id = conv;
  new_name := nullif(trim(coalesce(gname, '')), '');

  update public.conversations set
    name       = coalesce(new_name, name),
    avatar_url = coalesce(gavatar, avatar_url)
  where id = conv and is_group;

  if new_name is not null and new_name is distinct from old_name then
    insert into public.direct_messages(conversation_id, sender_id, content, type)
    values (conv, me, 'group_rename:' || new_name, 'system');
  end if;

  if gavatar is not null then
    insert into public.direct_messages(conversation_id, sender_id, content, type)
    values (conv, me, 'group_avatar', 'system');
  end if;
end;
$$;
