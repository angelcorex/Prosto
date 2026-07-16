-- Include full old row in realtime DELETE events (so clients can filter by conversation_id)
alter table public.direct_messages replica identity full;

-- Profile card stats for the hover/popup card: followers, following, posts
create or replace function public.get_profile_stats(uname text)
returns table(followers int, following int, posts int)
language sql
stable
security definer
as $$
  select
    coalesce((select count(*) from public.follows f join public.profiles p on p.id = f.following_id where p.username = uname), 0)::int,
    coalesce((select count(*) from public.follows f join public.profiles p on p.id = f.follower_id  where p.username = uname), 0)::int,
    coalesce((select count(*) from public.posts   po join public.profiles p on p.id = po.author_id  where p.username = uname), 0)::int;
$$;
