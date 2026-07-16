-- Ensure channel messages stream live to all members (idempotent re-assert in
-- case the publication entry from migration 044 didn't apply).

alter table public.channel_messages replica identity full;

do $$ begin
  begin
    alter publication supabase_realtime add table public.channel_messages;
  exception when duplicate_object then null;
  end;
end $$;
