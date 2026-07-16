-- ─────────────────────────────────────────────────────────────────────────
-- Editing DMs + pinning messages (DMs and server channels).
--
--   • edited_at — set when a message is edited (both tables), so the UI can
--     show an "(edited)" marker. channel edit already existed; this adds the
--     column + DM editing.
--   • pinned_at / pinned_by — a pinned message. In DMs EITHER participant can
--     pin/unpin (Telegram-style). In channels it needs MANAGE_MESSAGES (bit 64).
--   • Realtime: both tables already have `replica identity full` and are in the
--     supabase_realtime publication, so edit/pin UPDATEs stream to clients.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.direct_messages
  add column if not exists edited_at  timestamptz,
  add column if not exists pinned_at  timestamptz,
  add column if not exists pinned_by  uuid references public.profiles(id) on delete set null;

alter table public.channel_messages
  add column if not exists edited_at  timestamptz,
  add column if not exists pinned_at  timestamptz,
  add column if not exists pinned_by  uuid references public.profiles(id) on delete set null;

-- ── Edit a DM (author only) ─────────────────────────────────────────────────
create or replace function public.edit_dm(p_message uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_sender uuid; body text := trim(p_body);
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;
  select sender_id into v_sender from public.direct_messages where id = p_message;
  if v_sender is null then raise exception 'not found'; end if;
  if v_sender <> me then raise exception 'forbidden'; end if;
  update public.direct_messages set content = body, edited_at = now() where id = p_message;
end;
$$;
grant execute on function public.edit_dm(uuid, text) to authenticated;

-- Re-assert edit_channel_message to also stamp edited_at (was content-only).
create or replace function public.edit_channel_message(p_message uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_sender uuid; body text := trim(p_body);
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if body = '' or char_length(body) > 4000 then raise exception 'invalid content'; end if;
  select sender_id into v_sender from public.channel_messages where id = p_message;
  if v_sender is null then raise exception 'not found'; end if;
  if v_sender <> me then raise exception 'forbidden'; end if;
  update public.channel_messages set content = body, edited_at = now() where id = p_message;
end;
$$;
grant execute on function public.edit_channel_message(uuid, text) to authenticated;

-- ── Pin / unpin a DM (either participant, Telegram-style) ───────────────────
create or replace function public.pin_dm(p_message uuid, p_pin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_conv uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select conversation_id into v_conv from public.direct_messages where id = p_message;
  if v_conv is null then raise exception 'not found'; end if;
  -- Must be a participant of the conversation the message belongs to.
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = v_conv and profile_id = me
  ) then raise exception 'forbidden'; end if;

  if p_pin then
    update public.direct_messages set pinned_at = now(), pinned_by = me where id = p_message;
  else
    update public.direct_messages set pinned_at = null, pinned_by = null where id = p_message;
  end if;
end;
$$;
grant execute on function public.pin_dm(uuid, boolean) to authenticated;

-- ── Pin / unpin a channel message (needs MANAGE_MESSAGES = bit 64) ──────────
create or replace function public.pin_channel_message(p_message uuid, p_pin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_channel uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select channel_id into v_channel from public.channel_messages where id = p_message;
  if v_channel is null then raise exception 'not found'; end if;
  if (public.channel_perms(v_channel, me) & 64) = 0 then raise exception 'forbidden'; end if;

  if p_pin then
    update public.channel_messages set pinned_at = now(), pinned_by = me where id = p_message;
  else
    update public.channel_messages set pinned_at = null, pinned_by = null where id = p_message;
  end if;
end;
$$;
grant execute on function public.pin_channel_message(uuid, boolean) to authenticated;

-- ── Pinned lists (newest pin first) ─────────────────────────────────────────
create or replace function public.get_pinned_dms(conv uuid)
returns table(id uuid, content text, created_at timestamptz, edited_at timestamptz,
  pinned_at timestamptz, sender_id uuid, sender_username text, sender_display_name text,
  sender_avatar_url text)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.edited_at, m.pinned_at, m.sender_id,
    p.username, p.display_name, p.avatar_url
  from public.direct_messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = conv
    and m.pinned_at is not null
    and exists (select 1 from public.conversation_participants cp
                where cp.conversation_id = conv and cp.profile_id = auth.uid())
  order by m.pinned_at desc
  limit 50;
$$;
grant execute on function public.get_pinned_dms(uuid) to authenticated;

create or replace function public.get_pinned_channel(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, edited_at timestamptz,
  pinned_at timestamptz, sender_id uuid, sender_username text, sender_display_name text,
  sender_avatar_url text)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.edited_at, m.pinned_at, m.sender_id,
    p.username, p.display_name, p.avatar_url
  from public.channel_messages m
  join public.profiles p on p.id = m.sender_id
  where m.channel_id = p_channel
    and m.pinned_at is not null
    and public.is_channel_member(p_channel)
    and (public.channel_perms(p_channel, auth.uid()) & 128) <> 0
  order by m.pinned_at desc
  limit 50;
$$;
grant execute on function public.get_pinned_channel(uuid) to authenticated;

-- ── Re-assert message loaders to expose edited_at + pinned_at + pinned_by ───
drop function if exists public.get_conversation_messages(uuid);
create or replace function public.get_conversation_messages(conv uuid)
returns table(
  id uuid, content text, created_at timestamptz, sender_id uuid, type text, call_seconds int, reply_to uuid,
  edited_at timestamptz, pinned_at timestamptz, pinned_by uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean, sender_is_premium boolean
)
language sql stable security definer set search_path = public as $$
  select
    m.id, m.content, m.created_at, m.sender_id, m.type, m.call_seconds, m.reply_to,
    m.edited_at, m.pinned_at, m.pinned_by,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium
  from public.direct_messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = conv
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conv and cp.profile_id = auth.uid()
    )
  order by m.created_at asc
  limit 200;
$$;
grant execute on function public.get_conversation_messages(uuid) to authenticated;

drop function if exists public.get_channel_messages(uuid);
create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  edited_at timestamptz, pinned_at timestamptz, pinned_by uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean, sender_is_premium boolean,
  sender_role_color text, sender_role_color2 text, sender_role_glow text, sender_role_icon text)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.sender_id, m.reply_to,
    m.edited_at, m.pinned_at, m.pinned_by,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator, p.is_premium,
    (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.color2 from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.glow from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.glow is not null
       order by r.position desc limit 1),
    (select r.icon_url from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.icon_url is not null
       order by r.position desc limit 1)
  from public.channel_messages m
  join public.profiles p on p.id = m.sender_id
  join public.server_channels sc on sc.id = m.channel_id
  where m.channel_id = p_channel
    and public.is_channel_member(p_channel)
    and (public.channel_perms(p_channel, auth.uid()) & 128) <> 0
  order by m.created_at asc
  limit 200;
$$;
grant execute on function public.get_channel_messages(uuid) to authenticated;

notify pgrst, 'reload schema';
