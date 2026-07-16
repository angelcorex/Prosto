-- ─────────────────────────────────────────────────────────────────────────
-- Custom status text (Discord/Telegram-style).
--
-- A short free-text status shown under the display name on the profile/popup,
-- and — in the DM list + chat header — used INSTEAD of @username when set
-- (falls back to the username when empty). Max 45 chars.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists custom_status text;

alter table public.profiles
  drop constraint if exists custom_status_len;
alter table public.profiles
  add constraint custom_status_len check (custom_status is null or char_length(custom_status) <= 45);

-- Set / clear my custom status (empty string clears it).
create or replace function public.set_custom_status(p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v text := nullif(trim(coalesce(p_status, '')), '');
begin
  if me is null then raise exception 'unauthenticated'; end if;
  if v is not null and char_length(v) > 45 then v := left(v, 45); end if;
  update public.profiles set custom_status = v where id = me;
end;
$$;
grant execute on function public.set_custom_status(text) to authenticated;

-- Expose custom_status on the DM-list RPC so the list can show it instead of
-- @username. Re-assert get_my_conversations (latest from 20260621000089) with
-- other_custom_status added.
drop function if exists public.get_my_conversations(uuid);
create or replace function public.get_my_conversations(my_id uuid)
returns table(
  conversation_id uuid, is_group boolean, conv_public_id text, group_name text, group_avatar text,
  member_count int, other_id uuid, other_public_id text, other_username text, other_display_name text,
  other_avatar_url text, other_is_verified boolean, other_is_moderator boolean, other_is_premium boolean,
  other_status text, other_last_seen timestamptz, other_custom_status text,
  muted boolean, pinned boolean, unread_count int
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.is_group, c.public_id::text, c.name, c.avatar_url,
    (select count(*) from public.conversation_participants cpc where cpc.conversation_id = c.id)::int,
    o.id, o.public_id::text, o.username, o.display_name, o.avatar_url, o.is_verified, o.is_moderator, o.is_premium,
    o.status, o.last_seen, o.custom_status,
    cp.muted, cp.pinned,
    (
      select count(*)
      from public.direct_messages dm
      where dm.conversation_id = c.id
        and dm.sender_id <> my_id
        and coalesce(dm.type, 'text') <> 'system'
        and dm.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz)
    )::int as unread_count
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  left join lateral (
    select p.* from public.conversation_participants cp2
    join public.profiles p on p.id = cp2.profile_id
    where cp2.conversation_id = c.id and cp2.profile_id <> my_id
    limit 1
  ) o on (not c.is_group)
  where cp.profile_id = my_id and cp.hidden = false
  order by
    cp.pinned desc,
    coalesce(
      (select max(dm.created_at) from public.direct_messages dm where dm.conversation_id = c.id),
      c.created_at
    ) desc;
$$;
grant execute on function public.get_my_conversations(uuid) to authenticated;

notify pgrst, 'reload schema';
