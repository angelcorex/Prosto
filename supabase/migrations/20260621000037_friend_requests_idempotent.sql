-- ─────────────────────────────────────────────────────────────────────────
-- Make friendship a single global state, enforced server-side.
--
-- Before: the client upserted friend_requests and inserted notifications
-- directly, so a request could be (re)sent repeatedly, accepted multiple times,
-- and each action spammed a fresh notification. These RPCs make both actions
-- idempotent and consider BOTH directions, so once two users are friends they
-- can't request again, and re-clicking never creates duplicate notifications.
-- ─────────────────────────────────────────────────────────────────────────

-- Send (or auto-accept a mutual) friend request.
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or target is null or me = target then return 'noop'; end if;

  -- Blocked either way → refuse.
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = me and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = me)
  ) then
    raise exception 'blocked';
  end if;

  -- Already friends (either direction) → nothing to do.
  if exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.from_id = me and fr.to_id = target)
        or (fr.from_id = target and fr.to_id = me))
  ) then
    return 'already_friends';
  end if;

  -- They already requested me → accept it (mutual), become friends.
  if exists (
    select 1 from public.friend_requests fr
    where fr.from_id = target and fr.to_id = me and fr.status = 'pending'
  ) then
    update public.friend_requests
      set status = 'accepted'
      where from_id = target and to_id = me and status = 'pending';
    delete from public.friend_requests where from_id = me and to_id = target;
    perform public.notify_once(target, 'friend_accepted', me, null);
    return 'accepted';
  end if;

  -- Otherwise create/keep a single pending request and notify once.
  insert into public.friend_requests (from_id, to_id, status)
  values (me, target, 'pending')
  on conflict (from_id, to_id) do update set status = 'pending'
    where public.friend_requests.status <> 'accepted';

  perform public.notify_once(target, 'friend_request', me, null);
  return 'requested';
end;
$$;

-- Accept a pending incoming request, idempotently.
create or replace function public.accept_friend_request(from_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  updated int;
begin
  if me is null or from_user is null then return 'noop'; end if;

  update public.friend_requests
    set status = 'accepted'
    where from_id = from_user and to_id = me and status = 'pending';
  get diagnostics updated = row_count;

  -- Drop any reverse pending row so a friendship is never two rows.
  delete from public.friend_requests where from_id = me and to_id = from_user;

  -- Only notify when we actually transitioned pending → accepted; notify_once
  -- additionally guards against duplicates.
  if updated > 0 then
    perform public.notify_once(from_user, 'friend_accepted', me, null);
  end if;

  return case when updated > 0 then 'accepted' else 'noop' end;
end;
$$;

revoke all on function public.send_friend_request(uuid)   from public, anon;
revoke all on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid)   to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
