-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY HARDENING — remove over-permissive RLS policies.
--
-- Threat model: the browser holds the Supabase ANON key and can call PostgREST
-- directly, bypassing every Next.js server action and RPC. RLS is therefore the
-- REAL security boundary. Any `with check (true)` INSERT policy is a hole a
-- hostile client walks straight through.
--
-- All legitimate writes to these tables go through SECURITY DEFINER functions
-- (ensure_dm, create_group, add_group_members, send_dm, the notification
-- writers, etc.). Definer functions run as the function owner and BYPASS RLS,
-- so removing the permissive CLIENT policies does NOT affect them — it only
-- closes the direct-PostgREST path.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. notifications: anyone could forge a notification to anyone ───────────
-- "System can insert notifications" was `with check (true)` → any authenticated
-- client could POST a fake notification (phishing, spam) to any user. Notifs are
-- only ever written by SECURITY DEFINER RPCs (send_dm, send_channel_message,
-- follow/friend flows), so deny direct client inserts entirely.
drop policy if exists "System can insert notifications" on public.notifications;

-- ── 2. conversation_participants: BOLA — join any conversation, read its DMs ─
-- "Can join conversation" was `with check (true)`. Since direct_messages SELECT
-- only checks participant membership, a hostile client could INSERT itself into
-- ANY conversation and then read the whole thread. Participants are only ever
-- added by ensure_dm / create_group / add_group_members (all SECURITY DEFINER),
-- so remove the client INSERT policy. (SELECT/UPDATE own-row policies stay.)
drop policy if exists "Can join conversation" on public.conversation_participants;

-- ── 3. conversations: anyone could create arbitrary conversation rows ───────
-- "Anyone can create a conversation" was `with check (true)`. Conversations are
-- only created by ensure_dm / create_group (SECURITY DEFINER). Remove it.
drop policy if exists "Anyone can create a conversation" on public.conversations;

-- ── 4. user_sessions: device/session list of EVERY user was world-readable ──
-- "sessions readable" was `select using (true)` → any caller could read every
-- user's session_id + device + last_seen. The only public need (device icons)
-- is served by the get_user_devices() SECURITY DEFINER RPC, which stays. Narrow
-- the direct policy to the owner's own rows.
drop policy if exists "sessions readable" on public.user_sessions;
create policy "Own sessions readable"
  on public.user_sessions for select using (auth.uid() = user_id);

-- ── 5. direct_messages: direct INSERT bypassed rate-limit + length guard ────
-- The INSERT policy required sender_id = auth.uid() + membership (so NOT a BOLA
-- hole), but a direct PostgREST insert skips send_dm's check_rate_limit, the
-- 2000-char cap, block-guard and notifications. The only legit direct-insert
-- client path was call logging; it moves to log_call_message() below. After
-- that, deny direct client inserts so ALL messages go through the guarded RPC.
create or replace function public.log_call_message(conv_id uuid, kind text, seconds int default null)
returns table (id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_id uuid; new_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if kind not in ('started', 'ended') then raise exception 'invalid kind'; end if;
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and profile_id = me
  ) then raise exception 'not a participant'; end if;
  perform public.check_rate_limit('call_log', 30, 60);
  insert into public.direct_messages (conversation_id, sender_id, content, type, call_seconds)
  values (conv_id, me, kind, 'call', seconds)
  returning direct_messages.id, direct_messages.created_at into new_id, new_at;
  return query select new_id, new_at;
end;
$$;
grant execute on function public.log_call_message(uuid, text, int) to authenticated;

drop policy if exists "Participants can send messages" on public.direct_messages;

notify pgrst, 'reload schema';
