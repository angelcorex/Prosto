-- ─────────────────────────────────────────────────────────────────────────
-- PII LOCKDOWN — hide profiles.birth_date from the auto-generated REST API.
--
-- Threat model: the browser holds the Supabase ANON key and can call PostgREST
-- directly. `profiles` has a `select using (true)` policy (public profiles are
-- world-readable), which is correct for username/avatar/bio — but birth_date is
-- the user's EXACT date of birth (PII). With the anon key alone, anyone could
-- run GET /rest/v1/profiles?select=username,birth_date and exfiltrate the DOB
-- of every user. RLS is row-level and cannot hide a single column on rows the
-- client is allowed to read, so the fix is COLUMN-LEVEL privilege: revoke
-- SELECT(birth_date) from anon + authenticated.
--
-- All legitimate reads are the owner's own DOB (settings page + age gate). They
-- move to a SECURITY DEFINER accessor, which runs as the function owner and
-- therefore bypasses the column revoke. INSERT(birth_date) at registration is
-- unaffected (revoking SELECT does not touch INSERT), and every server-side age
-- check already goes through is_adult()/viewer_is_adult() (both DEFINER).
--
-- DEPLOY ORDER: ship the app code first (it stops selecting the column and
-- reads via get_my_birth_date with a fallback), THEN apply this migration.
-- The code tolerates either order, but code-first has zero visible window.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Own-DOB accessor (DEFINER bypasses the column revoke below) ──────────
create or replace function public.get_my_birth_date()
returns date language sql stable security definer set search_path = public as $$
  select birth_date from public.profiles where id = auth.uid();
$$;
grant execute on function public.get_my_birth_date() to authenticated;

-- ── 2. Re-route the write-once pin through the DEFINER accessor ─────────────
-- The UPDATE policy (migration 102) pins birth_date via a subquery that reads
-- the column AS THE CALLER. After the revoke in step 3 that read would fail
-- with "permission denied for column birth_date", blocking every profile
-- update. Route it through get_my_birth_date() (DEFINER) so the pin keeps
-- working without exposing the column to the caller. (is_verified / is_premium
-- are not revoked, so their subqueries stay as-is.)
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_verified = (select is_verified from public.profiles where id = auth.uid())
    and is_premium  = (select is_premium  from public.profiles where id = auth.uid())
    and birth_date  is not distinct from public.get_my_birth_date()
  );

-- ── 3. Revoke column-level SELECT on birth_date from the client roles ───────
-- After this, PostgREST rejects any request that selects birth_date for anon or
-- authenticated (403). Own-DOB reads go through get_my_birth_date(); server-side
-- gating goes through is_adult()/viewer_is_adult(); service-role (admin client)
-- is unaffected. Table-level SELECT on all other columns is untouched.
revoke select (birth_date) on public.profiles from anon, authenticated;

notify pgrst, 'reload schema';
