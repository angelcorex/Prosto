-- Realtime for live server structure updates (channels, categories, name/icon,
-- membership) across all clients without a page reload. RLS still limits each
-- subscriber to rows of servers they belong to.

alter table public.servers           replica identity full;
alter table public.server_channels   replica identity full;
alter table public.server_categories replica identity full;
alter table public.server_members    replica identity full;

do $$ begin
  begin alter publication supabase_realtime add table public.servers;           exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.server_channels;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.server_categories; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.server_members;    exception when duplicate_object then null; end;
end $$;
