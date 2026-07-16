-- ─────────────────────────────────────────────────────────────────────────
-- Server Home leaderboard: top members by messages sent over a period.
--   p_days null  → all time
--   p_days 7/30  → last N days
-- System markers (e.g. theme change) are excluded from the count.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_server_leaderboard(p_server uuid, p_days int default null)
returns table(profile_id uuid, username text, display_name text, avatar_url text,
  is_verified boolean, msg_count bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, count(*)::bigint
  from public.channel_messages m
  join public.server_channels sc on sc.id = m.channel_id
  join public.profiles p on p.id = m.sender_id
  where sc.server_id = p_server
    and public.is_server_member(p_server)
    and m.content <> 'sys:theme'
    and (p_days is null or m.created_at > now() - make_interval(days => p_days))
  group by p.id, p.username, p.display_name, p.avatar_url, p.is_verified
  order by count(*) desc, p.username asc
  limit 15;
$$;
grant execute on function public.get_server_leaderboard(uuid, int) to authenticated;
