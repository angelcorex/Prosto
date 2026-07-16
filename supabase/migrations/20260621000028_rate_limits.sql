-- ─────────────────────────────────────────────────────────────────────────
-- Server-side rate limiting (anti-spam).
--
-- Serverless functions can't share in-memory counters, so the hard limit lives
-- in the database. A fixed-window counter per (user, action) is cheap and
-- enough to stop floods; the client adds escalating delays + a "please wait"
-- popup on top for UX. The client limits are intentionally tighter so users are
-- warned before the server ever rejects.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.rate_limits (
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  action       text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  primary key (user_id, action)
);

alter table public.rate_limits enable row level security;
-- No policies: only SECURITY DEFINER functions touch this table.

-- Raises 'rate_limited' when the caller exceeds p_max hits per p_window_secs.
create or replace function public.check_rate_limit(
  p_action      text,
  p_max         integer,
  p_window_secs integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  cur_count integer;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  insert into public.rate_limits as rl (user_id, action, window_start, count)
  values (me, p_action, now(), 1)
  on conflict (user_id, action) do update
    set count = case
                  when rl.window_start < now() - make_interval(secs => p_window_secs)
                    then 1
                  else rl.count + 1
                end,
        window_start = case
                  when rl.window_start < now() - make_interval(secs => p_window_secs)
                    then now()
                  else rl.window_start
                end
  returning rl.count into cur_count;

  if cur_count > p_max then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- ── Re-assert send_dm with the rate-limit guard baked in ────────────────────
drop function if exists public.send_dm(uuid, text, uuid);
create or replace function public.send_dm(conv_id uuid, body text, reply uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  new_id uuid;
  new_at timestamptz;
  is_grp boolean := false;
begin
  if me is null then raise exception 'unauthenticated'; end if;

  -- Hard anti-spam ceiling: 15 messages / 10s per user across all chats.
  perform public.check_rate_limit('message', 15, 10);

  if not exists (select 1 from public.conversation_participants where conversation_id = conv_id and profile_id = me) then
    raise exception 'not a participant';
  end if;

  select coalesce(c.is_group, false) into is_grp from public.conversations c where c.id = conv_id;

  if not is_grp and exists (
    select 1
    from public.conversation_participants cp
    join public.blocks b
      on (b.blocker_id = me and b.blocked_id = cp.profile_id)
      or (b.blocker_id = cp.profile_id and b.blocked_id = me)
    where cp.conversation_id = conv_id and cp.profile_id <> me
  ) then
    raise exception 'blocked';
  end if;

  body := trim(body);
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;

  insert into public.direct_messages (conversation_id, sender_id, content, reply_to)
  values (conv_id, me, body, reply)
  returning direct_messages.id, direct_messages.created_at into new_id, new_at;

  update public.conversation_participants set hidden = false where conversation_id = conv_id;

  insert into public.notifications (user_id, type, actor_id, ref_id)
  select profile_id, 'message', me, conv_id
  from public.conversation_participants
  where conversation_id = conv_id and profile_id <> me;

  return query select new_id, new_at;
end;
$$;
