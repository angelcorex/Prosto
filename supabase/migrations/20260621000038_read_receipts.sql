-- ─────────────────────────────────────────────────────────────────────────
-- Read receipts + cross-device read sync.
--
-- We already track conversation_participants.last_read_at. This exposes the
-- *other* participant's last_read_at (so the sender can see "Read"), and makes
-- a participant's own last_read_at change broadcast over realtime so reading on
-- one device clears the unread badge on the user's other devices.
-- ─────────────────────────────────────────────────────────────────────────

-- The other DM participant's last_read_at (max across other members). Returns
-- null until they've read anything. Only works for conversations the caller is
-- a member of.
create or replace function public.get_dm_read_at(conv uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(cp.last_read_at)
  from public.conversation_participants cp
  where cp.conversation_id = conv
    and cp.profile_id <> auth.uid()
    and exists (
      select 1 from public.conversation_participants me
      where me.conversation_id = conv and me.profile_id = auth.uid()
    );
$$;

revoke all on function public.get_dm_read_at(uuid) from public, anon;
grant execute on function public.get_dm_read_at(uuid) to authenticated;

-- Realtime on participant rows so a last_read_at change (reading elsewhere)
-- reaches the user's other devices. RLS still limits each client to its own
-- participant rows.
alter table public.conversation_participants replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.conversation_participants;
  exception when duplicate_object then null;
  end;
end $$;
