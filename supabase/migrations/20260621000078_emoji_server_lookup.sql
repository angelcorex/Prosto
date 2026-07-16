-- Given a server emoji URL, return the server's public info + whether the
-- calling user is already a member. Accessible to any authenticated user so
-- that DM recipients can see info about emojis from servers they haven't joined.
create or replace function public.get_server_by_emoji_url(p_url text)
returns table(
  id           uuid,
  public_id    text,
  name         text,
  icon_url     text,
  member_count int,
  online_count int,
  is_member    boolean,
  is_public    boolean
)
language sql stable security definer set search_path = public as $$
  select
    s.id,
    s.public_id::text,
    s.name,
    s.icon_url,
    (select count(*)::int from public.server_members m where m.server_id = s.id),
    (select count(*)::int from public.server_members m
       join public.profiles pp on pp.id = m.profile_id
       where m.server_id = s.id
         and pp.last_seen is not null
         and pp.last_seen > now() - interval '5 minutes'),
    public.is_server_member(s.id),
    s.is_public
  from public.server_emojis e
  join public.servers s on s.id = e.server_id
  where e.url = p_url
  limit 1;
$$;

grant execute on function public.get_server_by_emoji_url(text) to authenticated;
