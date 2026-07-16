-- ─────────────────────────────────────────────────────────────────────────
-- Reactions v2: react with ANY emoji — including custom server emojis — and
-- fix the channel-reaction path.
--
-- Migration 81 shipped three problems this migration corrects:
--   1. The `emoji` value was capped at 20 chars. A single Unicode emoji fits,
--      but a custom server-emoji token (`<:name:url>`, the same format the
--      chat uses) does not — so custom emojis could never be a reaction.
--      → Widen the cap to 512.
--   2. `toggle_message_reaction` looked up the server via `public.channels`,
--      a table that doesn't exist (it's `public.server_channels`), so EVERY
--      channel-message reaction raised an error. → Fixed here.
--   3. The owner's implicit permission mask (`server_perms`) was 2047, which
--      predates ADD_REACTIONS(2048) — so owners weren't implicitly granted it.
--      → Bump the owner mask to 4095 (all current bits, 1..2048).
--
-- Also: migration 81's `_ensure_everyone` accidentally dropped USE_GIF(512)
-- from the default @everyone role of newly-created servers. Restore it.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Allow a reaction value long enough to hold a custom emoji token.
--    Drop the old length CHECK robustly (by definition, not by assumed name),
--    then re-add a generous 512-char cap.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.post_reactions'::regclass, 'public.message_reactions'::regclass)
      and pg_get_constraintdef(oid) ilike '%char_length(emoji)%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.post_reactions
  add constraint post_reactions_emoji_check    check (char_length(emoji) between 1 and 512);
alter table public.message_reactions
  add constraint message_reactions_emoji_check check (char_length(emoji) between 1 and 512);

-- 2. Owner implicitly holds every permission bit, now including ADD_REACTIONS.
--    1+2+4+8+16+32+64+128+256+512+1024+2048 = 4095.
create or replace function public.server_perms(p_server uuid, p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.servers where id = p_server and owner_id = p_user) then 4095::bigint
    else coalesce((
      select bit_or(r.permissions)
      from public.server_roles r
      where r.server_id = p_server
        and (r.is_default or r.id in (
          select mr.role_id from public.server_member_roles mr where mr.profile_id = p_user
        ))
    ), 0::bigint)
  end;
$$;

-- 3. Toggle a reaction on a channel or DM message. Returns true = added.
--    Channel path now joins the correct table (server_channels) and checks
--    ADD_REACTIONS(2048); the server owner is always allowed.
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
    -- Verify the user is a server member and may add reactions.
    select sc.server_id into v_server
      from public.channel_messages cm
      join public.server_channels sc on sc.id = cm.channel_id
      where cm.id = p_message;
    if v_server is null then raise exception 'not found'; end if;
    if not public.is_server_member(v_server) then raise exception 'forbidden'; end if;
    if not (public.server_perms(v_server, me) & 2048 <> 0 or
            exists (select 1 from public.servers where id = v_server and owner_id = me)) then
      raise exception 'no permission';
    end if;
  else
    -- DM: verify the user is a conversation participant.
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

-- 4. Restore USE_GIF(512) in the default @everyone role for new servers.
--    READ_HISTORY(128)+USE_EMOJI(32)+SEND_MESSAGES(16)+CREATE_INVITE(8)
--    +USE_GIF(512)+ADD_REACTIONS(2048) = 2744.
create or replace function public._ensure_everyone(p_server uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.server_roles (server_id, name, permissions, position, is_default)
  select p_server, '@everyone', 2744, 0, true
  where not exists (select 1 from public.server_roles where server_id = p_server and is_default);
end;
$$;
