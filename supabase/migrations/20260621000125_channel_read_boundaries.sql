-- Mark a channel read only through the exact message rendered by the client.
--
-- mark_channel_read(uuid) intentionally remains available for older clients.
-- New clients use this boundary-aware RPC so a message committed while the tab
-- is hidden or while a navigation request is in flight cannot be swept into the
-- read marker merely because it became the channel's latest row.
create or replace function public.mark_channel_read_through(
  p_channel uuid,
  p_message uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  me           uuid := auth.uid();
  boundary_at  timestamptz;
  effective_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if not public.is_channel_member(p_channel) then raise exception 'forbidden'; end if;
  if (public.channel_perms(p_channel, me) & 128) = 0 then raise exception 'forbidden'; end if;

  select m.created_at
  into boundary_at
  from public.channel_messages m
  where m.id = p_message and m.channel_id = p_channel;

  if boundary_at is null then raise exception 'invalid message boundary'; end if;

  insert into public.channel_reads (
    profile_id,
    channel_id,
    last_read_at,
    last_read_message_id
  )
  values (me, p_channel, boundary_at, p_message)
  on conflict (profile_id, channel_id) do update
    set last_read_at = greatest(channel_reads.last_read_at, excluded.last_read_at),
        last_read_message_id = case
          when excluded.last_read_at >= channel_reads.last_read_at
            then excluded.last_read_message_id
          else channel_reads.last_read_message_id
        end;

  select cr.last_read_at
  into effective_at
  from public.channel_reads cr
  where cr.profile_id = me and cr.channel_id = p_channel;

  -- Clear only mentions at or before the effective read boundary. Legacy
  -- rows without message_id and dangling rows whose message was deleted can no
  -- longer point to unread content, so opening the channel clears them too.
  update public.notifications n
  set read = true
  where n.user_id = me
    and n.type = 'mention'
    and n.ref_id = p_channel
    and n.read = false
    and (
      n.message_id is null
      or not exists (
        select 1
        from public.channel_messages deleted_message
        where deleted_message.id = n.message_id
      )
      or exists (
        select 1
        from public.channel_messages m
        where m.id = n.message_id
          and m.channel_id = p_channel
          and m.created_at <= effective_at
      )
    );

  return effective_at;
end;
$$;

revoke all on function public.mark_channel_read_through(uuid, uuid) from public, anon;
grant execute on function public.mark_channel_read_through(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
