-- Full account deletion.
--
-- Deleting the auth.users row cascades through profiles (id references
-- auth.users on delete cascade) and from there to every table that references
-- profiles on delete cascade: posts, comments, likes, reposts, follows,
-- friend_requests, notifications, conversation_participants, direct_messages,
-- blocks, gif_favorites, rate_limits. Group ownership (conversations.owner_id)
-- and notification actors are nulled out. One statement, the database does the
-- rest — friendships disappear for everyone automatically.
--
-- security definer so it can delete from the protected auth schema; it only
-- ever deletes the *calling* user, never anyone else.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
