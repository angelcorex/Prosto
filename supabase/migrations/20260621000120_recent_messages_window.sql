-- ─────────────────────────────────────────────────────────────────────────
-- FIX: message history loaded the OLDEST 200 messages, not the newest.
--
-- get_conversation_messages / get_channel_messages did `order by created_at
-- asc limit 200`, which returns the first 200 messages ever sent. In any
-- conversation past 200 messages, everything newer falls OUTSIDE the window:
-- it streams in live via the realtime INSERT handler, but every authoritative
-- refetch (entering the chat, SSR reload, post-action refetch) drops it — so
-- freshly-sent messages "vanish" on reload for BOTH participants.
--
-- Pinning made it worse / correlated: pin_dm inserts a `type='system'` row,
-- and every such row eats one of the 200 slots — so interacting with pins is
-- what tips a busy DM over the edge (matches the "breaks after pinning" report).
--
-- Fix: select the NEWEST 200 (order desc, limit), then re-sort ascending for
-- display. Same change for both DM and channel loaders. Signatures unchanged.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.get_conversation_messages(uuid);
create or replace function public.get_conversation_messages(conv uuid)
returns table(
  id uuid, content text, created_at timestamptz, sender_id uuid, type text, call_seconds int, reply_to uuid,
  edited_at timestamptz, pinned_at timestamptz, pinned_by uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean, sender_is_premium boolean
)
language sql stable security definer set search_path = public as $$
  select id, content, created_at, sender_id, type, call_seconds, reply_to,
    edited_at, pinned_at, pinned_by,
    sender_username, sender_display_name, sender_avatar_url,
    sender_is_verified, sender_is_moderator, sender_is_premium
  from (
    select
      m.id, m.content, m.created_at, m.sender_id, m.type, m.call_seconds, m.reply_to,
      m.edited_at, m.pinned_at, m.pinned_by,
      p.username as sender_username, p.display_name as sender_display_name,
      p.avatar_url as sender_avatar_url, p.is_verified as sender_is_verified,
      p.is_moderator as sender_is_moderator, p.is_premium as sender_is_premium
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

-- ── Channel history: same newest-200 window fix (re-assert from 20260621000114) ──
drop function if exists public.get_channel_messages(uuid);
create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  edited_at timestamptz, pinned_at timestamptz, pinned_by uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean, sender_is_premium boolean,
  sender_role_color text, sender_role_color2 text, sender_role_glow text, sender_role_icon text)
language sql stable security definer set search_path = public as $$
  select id, content, created_at, sender_id, reply_to,
    edited_at, pinned_at, pinned_by,
    sender_username, sender_display_name, sender_avatar_url,
    sender_is_verified, sender_is_moderator, sender_is_premium,
    sender_role_color, sender_role_color2, sender_role_glow, sender_role_icon
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
         order by r.position desc limit 1) as sender_role_icon
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
grant execute on function public.get_channel_messages(uuid) to authenticated;

notify pgrst, 'reload schema';
