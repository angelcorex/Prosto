-- Support system "call" messages inside the conversation timeline
-- (e.g. "X started a call that lasted 1:23" / missed call).
alter table public.direct_messages
  add column if not exists type text not null default 'text'
    check (type in ('text', 'call')),
  add column if not exists call_seconds int;
