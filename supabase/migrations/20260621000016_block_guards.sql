-- Helper to detect a block between the caller and another user (either direction).
create or replace function public.block_exists_between(other uuid)
returns boolean
language sql stable security definer
as $$
  select exists(
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  );
$$;
