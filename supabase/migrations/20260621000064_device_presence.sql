-- ─────────────────────────────────────────────────────────────────────────
-- Device presence: which kind of device a user is online from
-- ('apple' | 'mobile' | 'desktop'), shown as a small icon next to their name.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists device text;

-- Set the caller's current device kind (called by the client heartbeat).
create or replace function public.set_device(p_device text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles
  set device = nullif(p_device, '')
  where id = auth.uid();
end;
$$;
grant execute on function public.set_device(text) to authenticated;
