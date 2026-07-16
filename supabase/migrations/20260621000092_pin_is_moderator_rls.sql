-- ─────────────────────────────────────────────────────────────────────────
-- Security fix: pin is_moderator in the profiles self-update policy.
--
-- The self-update policy (last set in 20260621000089) locks is_verified and
-- is_premium so a user cannot flip them on their own row, but it never locked
-- is_moderator. Because RLS — not the app UI — is the real trust boundary and
-- the anon key is public, any authenticated user could call
--   supabase.from('profiles').update({ is_moderator: true }).eq('id', <self>)
-- and self-grant the moderator flag. Today that only paints a moderator badge
-- (trust/impersonation abuse); it also becomes a full privilege escalation the
-- moment any server logic gates a capability on is_moderator.
--
-- Recreate the policy so is_verified, is_premium AND is_moderator all stay
-- pinned to their stored value. Granting/revoking moderator remains a
-- service-role / dashboard operation (which bypasses RLS), exactly like
-- is_verified and is_premium.
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and is_verified  = (select is_verified  from public.profiles where id = auth.uid())
    and is_premium   = (select is_premium   from public.profiles where id = auth.uid())
    and is_moderator = (select is_moderator from public.profiles where id = auth.uid())
  );
