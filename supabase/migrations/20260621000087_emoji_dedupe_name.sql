-- ─────────────────────────────────────────────────────────────────────────
-- Auto-deduplicate custom emoji names on upload. If the sanitised name is
-- already taken on the server, append `_1`, `_2`, … (Discord-style) instead of
-- failing with a "duplicate name" error — so uploading a second "fluttershy"
-- lands as "fluttershy_1". The suffix uses `_` (not `-`) because emoji names —
-- and the `<a?:name:id>` tokens that reference them — only allow [a-z0-9_];
-- a hyphenated name wouldn't render.
--
-- A unique index on (server_id, lower(name)) already guards the column, so we
-- also catch unique_violation and retry, making the increment race-safe.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.add_server_emoji(
  p_server uuid, p_name text, p_url text, p_animated boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  base   text;
  clean  text;
  cnt    int;
  n      int := 0;
  suffix text;
  new_id uuid;
begin
  if not public.has_perm(p_server, 4) then raise exception 'forbidden'; end if;

  base := lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9_]', '', 'g'));
  if length(base) < 2 then raise exception 'invalid name'; end if;
  base := left(base, 32);

  -- Per-type caps (static vs animated).
  select count(*) into cnt from public.server_emojis
    where server_id = p_server and is_animated = p_animated;
  if p_animated and cnt >= 50 then raise exception 'animated limit reached'; end if;
  if not p_animated and cnt >= 100 then raise exception 'emoji limit reached'; end if;

  -- Try base, then base_1, base_2, … keeping within the 32-char limit. The
  -- unique index makes concurrent inserts safe: on collision we bump and retry.
  loop
    if n = 0 then
      clean := base;
    else
      suffix := '_' || n::text;
      clean  := left(base, 32 - length(suffix)) || suffix;
    end if;

    begin
      insert into public.server_emojis (server_id, name, url, is_animated, created_by)
      values (p_server, clean, p_url, p_animated, auth.uid())
      returning id into new_id;
      return new_id;
    exception when unique_violation then
      n := n + 1;
      if n > 999 then raise exception 'too many duplicates'; end if;
    end;
  end loop;
end;
$$;
grant execute on function public.add_server_emoji(uuid, text, text, boolean) to authenticated;

-- Refresh PostgREST's schema cache so the recreated RPC resolves immediately.
notify pgrst, 'reload schema';
