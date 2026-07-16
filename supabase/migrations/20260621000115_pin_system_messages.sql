-- ─────────────────────────────────────────────────────────────────────────
-- System message when a message is pinned (like the existing group/theme
-- system events). Renders as a centred timeline line: "X pinned a message".
--
--   • DM:      insert a direct_messages row with type='system', content='pinned'.
--   • Channel: insert a channel_messages row with content='sys:pin' (channel
--     messages have no `type` column; the client keys off the `sys:` marker,
--     same as the existing 'sys:theme').
--
-- Only PINNING emits a system message (not unpinning) — matching Telegram/
-- Discord. The pinned message itself still flips pinned_at for the pin bar.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.pin_dm(p_message uuid, p_pin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_conv uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select conversation_id into v_conv from public.direct_messages where id = p_message;
  if v_conv is null then raise exception 'not found'; end if;
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = v_conv and profile_id = me
  ) then raise exception 'forbidden'; end if;

  if p_pin then
    update public.direct_messages set pinned_at = now(), pinned_by = me where id = p_message;
    insert into public.direct_messages (conversation_id, sender_id, content, type)
    values (v_conv, me, 'pinned', 'system');
  else
    update public.direct_messages set pinned_at = null, pinned_by = null where id = p_message;
  end if;
end;
$$;
grant execute on function public.pin_dm(uuid, boolean) to authenticated;

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
    insert into public.channel_messages (channel_id, sender_id, content)
    values (v_channel, me, 'sys:pin');
  else
    update public.channel_messages set pinned_at = null, pinned_by = null where id = p_message;
  end if;
end;
$$;
grant execute on function public.pin_channel_message(uuid, boolean) to authenticated;

-- get_channel_unreads must not count system markers (sys:pin / sys:theme) as
-- unread messages — otherwise pinning bumps every member's unread badge.
create or replace function public.get_channel_unreads()
returns table(
  channel_id        uuid,
  channel_public_id text,
  server_public_id  text,
  unread_count      int,
  mention_count     int
)
language sql stable security definer set search_path = public as $$
  with my_channels as (
    select sc.id as channel_id, sc.public_id as channel_public_id,
           s.public_id as server_public_id
    from public.server_channels sc
    join public.servers s on s.id = sc.server_id
    join public.server_members sm on sm.server_id = s.id and sm.profile_id = auth.uid()
    where (public.channel_perms(sc.id, auth.uid()) & 128) <> 0  -- READ_HISTORY
  )
  select
    mc.channel_id,
    mc.channel_public_id::text,
    mc.server_public_id::text,
    (
      select count(*) from public.channel_messages m
      where m.channel_id = mc.channel_id
        and m.sender_id <> auth.uid()
        and m.content not like 'sys:%'
        and m.created_at > coalesce(
          (select cr.last_read_at from public.channel_reads cr
           where cr.profile_id = auth.uid() and cr.channel_id = mc.channel_id),
          'epoch'::timestamptz)
    )::int as unread_count,
    (
      select count(*) from public.notifications n
      where n.user_id = auth.uid()
        and n.type = 'mention'
        and n.ref_id = mc.channel_id
        and n.read = false
    )::int as mention_count
  from my_channels mc;
$$;
grant execute on function public.get_channel_unreads() to authenticated;

notify pgrst, 'reload schema';
