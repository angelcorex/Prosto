-- ─────────────────────────────────────────────────────────────────────────
-- Scoped message search for the context-aware filter search (right-panel).
--
-- Two entry points, both SECURITY DEFINER + membership-checked so a caller only
-- ever sees messages from a server / conversation they belong to:
--   • search_server_messages — across every channel of one server,
--   • search_dm_messages      — within one DM or group conversation.
--
-- Filters (all optional, combined with AND):
--   p_q        free-text substring in the message content,
--   p_from     sender username (exact, case-insensitive),
--   p_mentions content mentions `@username`,
--   p_has      attachment/link kind: 'image' | 'video' | 'file' | 'link' | 'embed',
--   p_before / p_after   created_at bounds (exclusive / inclusive).
--
-- `has` is matched against the message content, where chat/post attachments are
-- stored as URLs (image/video by extension, everything else as a generic link).
-- ─────────────────────────────────────────────────────────────────────────

-- Shared predicate: does `content` satisfy a `has:` kind?
create or replace function public.msg_has_kind(content text, kind text)
returns boolean language sql immutable as $$
  select case kind
    when 'image' then content ~* '\.(png|jpe?g|webp|gif|avif)(\?|$|[[:space:]])'
    when 'video' then content ~* '\.(mp4|webm|mov|m4v|ogv)(\?|$|[[:space:]])'
    when 'link'  then content ~* 'https?://'
    when 'embed' then content ~* 'https?://'
    when 'file'  then content ~* 'https?://'
    else true
  end;
$$;

-- ── Server-wide search ──────────────────────────────────────────────────────
create or replace function public.search_server_messages(
  p_server_public_id text,
  p_q        text        default null,
  p_from     text        default null,
  p_mentions text        default null,
  p_has      text        default null,
  p_before   timestamptz default null,
  p_after    timestamptz default null,
  lim        int         default 40
)
returns table(
  id uuid, content text, created_at timestamptz,
  channel_id uuid, channel_public_id text, channel_name text,
  sender_id uuid, sender_username text, sender_display_name text, sender_avatar_url text
)
language sql stable security definer set search_path = public as $$
  with srv as (
    select id from public.servers where public_id::text = p_server_public_id
  )
  select m.id, m.content, m.created_at,
         sc.id, sc.public_id::text, sc.name,
         p.id, p.username, p.display_name, p.avatar_url
  from public.channel_messages m
  join public.server_channels sc on sc.id = m.channel_id
  join srv                       on srv.id = sc.server_id
  join public.profiles p         on p.id = m.sender_id
  where public.is_server_member((select id from srv))
    and (p_q        is null or m.content ilike '%' || p_q || '%')
    and (p_from     is null or p.username ilike p_from)
    and (p_mentions is null or m.content ilike '%@' || p_mentions || '%')
    and (p_before   is null or m.created_at <  p_before)
    and (p_after    is null or m.created_at >= p_after)
    and (p_has      is null or public.msg_has_kind(m.content, lower(p_has)))
  order by m.created_at desc
  limit least(coalesce(lim, 40), 100);
$$;

grant execute on function public.search_server_messages(text, text, text, text, text, timestamptz, timestamptz, int)
  to authenticated;

-- ── DM / group conversation search ──────────────────────────────────────────
-- `p_route_id` is what the /messages/[id] route carries: a group's public_id OR
-- the other user's profile public_id (a 1:1 DM). Resolve it to a conversation
-- the caller participates in, then search its messages.
create or replace function public.search_dm_messages(
  p_route_id text,
  p_q        text        default null,
  p_from     text        default null,
  p_mentions text        default null,
  p_has      text        default null,
  p_before   timestamptz default null,
  p_after    timestamptz default null,
  lim        int         default 40
)
returns table(
  id uuid, content text, created_at timestamptz,
  sender_id uuid, sender_username text, sender_display_name text, sender_avatar_url text
)
language plpgsql stable security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  v_conv  uuid;
  v_other uuid;
begin
  if me is null then return; end if;

  -- Group conversation by public_id?
  select c.id into v_conv
  from public.conversations c
  where c.public_id::text = p_route_id and c.is_group
  limit 1;

  -- Otherwise a 1:1 DM keyed by the other user's profile public_id.
  if v_conv is null then
    select pr.id into v_other from public.profiles pr where pr.public_id::text = p_route_id limit 1;
    if v_other is not null then
      select public.find_dm_conversation(me, v_other) into v_conv;
    end if;
  end if;

  if v_conv is null then return; end if;

  -- Caller must be a participant.
  if not exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = v_conv and cp.profile_id = me
  ) then
    return;
  end if;

  return query
    select m.id, m.content, m.created_at,
           p.id, p.username, p.display_name, p.avatar_url
    from public.direct_messages m
    join public.profiles p on p.id = m.sender_id
    where m.conversation_id = v_conv
      and (p_q        is null or m.content ilike '%' || p_q || '%')
      and (p_from     is null or p.username ilike p_from)
      and (p_mentions is null or m.content ilike '%@' || p_mentions || '%')
      and (p_before   is null or m.created_at <  p_before)
      and (p_after    is null or m.created_at >= p_after)
      and (p_has      is null or public.msg_has_kind(m.content, lower(p_has)))
    order by m.created_at desc
    limit least(coalesce(lim, 40), 100);
end;
$$;

grant execute on function public.search_dm_messages(text, text, text, text, text, timestamptz, timestamptz, int)
  to authenticated;
