-- ─────────────────────────────────────────────────────────────────────────
-- Manage custom emojis by their short snowflake public_id (the same compact id
-- they're referenced by in `<:name:id>` tokens and shown in the UI) instead of
-- the internal uuid — so an emoji is addressed by the same kind of id as a
-- user/server. Recreating these functions and reloading the PostgREST schema
-- cache at the end also clears the
--   "Could not find the function public.rename_server_emoji(...) in the schema cache"
-- error.
-- ─────────────────────────────────────────────────────────────────────────

-- Drop the old uuid-keyed variants so there's no overload ambiguity when the
-- client calls with a (numeric) public_id string.
drop function if exists public.rename_server_emoji(uuid, text);
drop function if exists public.delete_server_emoji(uuid);

-- Rename by public_id (requires MANAGE_SERVER, bit 4). Sanitises the new name
-- and keeps the per-server case-insensitive uniqueness rule.
create or replace function public.rename_server_emoji(p_id text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare eid uuid; srv uuid; clean text;
begin
  select id, server_id into eid, srv
  from public.server_emojis where public_id = p_id::bigint;
  if srv is null then raise exception 'not found'; end if;
  if not public.has_perm(srv, 4) then raise exception 'forbidden'; end if;

  clean := lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9_]', '', 'g'));
  if length(clean) < 2 or length(clean) > 32 then
    raise exception 'invalid name';
  end if;
  if exists (
    select 1 from public.server_emojis
    where server_id = srv and lower(name) = clean and id <> eid
  ) then
    raise exception 'duplicate name';
  end if;

  update public.server_emojis set name = clean where id = eid;
end;
$$;
grant execute on function public.rename_server_emoji(text, text) to authenticated;

-- Delete by public_id (requires MANAGE_SERVER, bit 4).
create or replace function public.delete_server_emoji(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare eid uuid; srv uuid;
begin
  select id, server_id into eid, srv
  from public.server_emojis where public_id = p_id::bigint;
  if srv is null then return; end if;
  if not public.has_perm(srv, 4) then raise exception 'forbidden'; end if;
  delete from public.server_emojis where id = eid;
end;
$$;
grant execute on function public.delete_server_emoji(text) to authenticated;

-- Refresh PostgREST's schema cache so the recreated RPCs resolve immediately.
notify pgrst, 'reload schema';
