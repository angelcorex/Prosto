-- Broadcast profile changes (status / last_seen / avatar) over realtime so
-- presence and profile data update instantly everywhere at once.

alter table public.profiles replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end $$;
