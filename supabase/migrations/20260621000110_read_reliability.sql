-- ─────────────────────────────────────────────────────────────────────────
-- Reliable DM read state.
--
-- Two long-standing bugs are fixed at the source here:
--   1. "Unread comes back after leaving a chat" — the client marked read on a
--      500ms timer that was cancelled on fast navigation, so last_read_at never
--      advanced past the last seen message. mark_conversation_read now returns
--      the new last_read_at so the client can confirm + optimistically sync all
--      badges, and the client calls it synchronously on open / unmount.
--   2. "Read receipt (✓✓) not live" — the client polled get_dm_read_at every 10s.
--      conversation_participants is already in the realtime publication with
--      replica identity full (migration 38), so the client now subscribes
--      instead. No schema change needed for that; this just returns the value.
--
-- mark_conversation_read previously returned void; we redefine it to return the
-- timestamp it set. Existing fire-and-forget callers ignore the return, so this
-- is backwards compatible.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.mark_conversation_read(uuid);
create or replace function public.mark_conversation_read(conv_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz := now();
begin
  update public.conversation_participants
  set last_read_at = ts
  where conversation_id = conv_id and profile_id = auth.uid();
  return ts;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

notify pgrst, 'reload schema';
