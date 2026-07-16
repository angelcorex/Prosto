-- Friends & notifications: realtime delivery + richer notification types.

-- Allow the extra notification types we now emit.
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('follow','friend_request','friend_accepted','message'));

-- Make sure realtime can broadcast inserts/updates for these tables.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.friend_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.follows;
  exception when duplicate_object then null;
  end;
end $$;

-- Full row data on updates/deletes so the client can react precisely.
alter table public.notifications  replica identity full;
alter table public.friend_requests replica identity full;
