-- ─────────────────────────────────────────────────────────────────────────
-- Fix "sent DM messages vanish" — caused by DUPLICATE 2-person conversations.
--
-- Root cause: ensure_dm had no lock, so when two clients (web + desktop) opened
-- the same DM near-simultaneously, both saw find_dm_conversation() = null and
-- each created its OWN conversations row for the same pair. Messages sent from
-- the "losing" duplicate persisted fine, but every later resolve picked the
-- OLDEST row (find_dm_conversation orders by created_at asc) — so those messages
-- appeared to disappear. The messages/[id]/page.tsx fallback insert (client-side
-- UUID) made a second racing path.
--
-- This migration:
--   1. Merges existing duplicate 2-person DMs into the oldest conversation.
--   2. Adds ensure_dm advisory-lock so the race can't recur.
-- The client change (drop the fallback insert) lands separately.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Merge duplicate 2-person conversations ──────────────────────────────
-- For each pair with >1 DM conversation, keep the oldest ("canonical") and move
-- every message + participant setting onto it, then delete the empty duplicates.
do $$
declare
  grp record;
  canonical uuid;
  dup uuid;
begin
  -- Group 2-person DM conversations by their (sorted) participant pair.
  for grp in
    with dm_pairs as (
      select cp.conversation_id,
             c.created_at,
             (array_agg(cp.profile_id order by cp.profile_id))[1] as a,
             (array_agg(cp.profile_id order by cp.profile_id))[2] as b,
             count(*) as n
      from public.conversation_participants cp
      join public.conversations c on c.id = cp.conversation_id
      where coalesce(c.is_group, false) = false
      group by cp.conversation_id, c.created_at
      having count(*) = 2
    )
    select a, b, min(created_at) as first_at, count(*) as convs
    from dm_pairs
    group by a, b
    having count(*) > 1
  loop
    -- Canonical = oldest conversation for this pair.
    select conversation_id into canonical
    from (
      select cp.conversation_id, c.created_at
      from public.conversation_participants cp
      join public.conversations c on c.id = cp.conversation_id
      where coalesce(c.is_group, false) = false
        and cp.profile_id in (grp.a, grp.b)
      group by cp.conversation_id, c.created_at
      having count(*) filter (where cp.profile_id in (grp.a, grp.b)) = 2
         and count(*) = 2
      order by c.created_at asc
      limit 1
    ) x;

    -- Move messages from every other duplicate onto the canonical conversation.
    for dup in
      select cp.conversation_id
      from public.conversation_participants cp
      join public.conversations c on c.id = cp.conversation_id
      where coalesce(c.is_group, false) = false
        and cp.profile_id in (grp.a, grp.b)
        and cp.conversation_id <> canonical
      group by cp.conversation_id
      having count(*) = 2
    loop
      update public.direct_messages set conversation_id = canonical where conversation_id = dup;
      -- Un-hide the canonical for both, so the merged thread is visible.
      update public.conversation_participants set hidden = false
        where conversation_id = canonical;
      -- Drop the now-empty duplicate (participants cascade).
      delete from public.conversations where id = dup;
    end loop;
  end loop;
end $$;

-- ── 2. ensure_dm with an advisory lock (serialise create for a pair) ────────
create or replace function public.ensure_dm(other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  conv uuid;
  a    uuid;
  b    uuid;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if other is null or other = me then raise exception 'invalid target'; end if;

  -- Canonical, order-independent pair key → one lock per pair, so two racing
  -- callers serialise here and the second one finds the first's conversation.
  a := least(me, other);
  b := greatest(me, other);
  perform pg_advisory_xact_lock(hashtextextended(a::text || ':' || b::text, 0));

  select public.find_dm_conversation(me, other) into conv;

  if conv is null then
    conv := gen_random_uuid();
    insert into public.conversations(id, is_group) values (conv, false);
    -- Hidden until the first message (send_dm unhides). Opening a chat and
    -- writing nothing must not surface it in either user's DM list.
    insert into public.conversation_participants(conversation_id, profile_id, hidden)
      values (conv, me, true), (conv, other, true)
      on conflict do nothing;
  else
    update public.conversation_participants
      set hidden = false
      where conversation_id = conv and profile_id = me;
  end if;

  return conv;
end;
$$;
grant execute on function public.ensure_dm(uuid) to authenticated;

notify pgrst, 'reload schema';
