-- Short invite codes (e.g. /i/Ab3xK9pQ) + a richer invite preview (banner +
-- online count) for the in-app invite embed.

-- 8-char unambiguous base-56 code.
create or replace function public.gen_invite_code()
returns text language plpgsql as $$
declare
  chars text := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
  end loop;
  return code;
end;
$$;

-- One reusable short code per server; legacy long codes are upgraded on next use.
create or replace function public.create_server_invite(p_server uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); existing text; code text;
begin
  if not public.is_server_member(p_server) then raise exception 'forbidden'; end if;
  select token into existing from public.server_invites where server_id = p_server;
  if existing is not null and char_length(existing) <= 12 then
    return existing;
  end if;
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.server_invites where token = code);
  end loop;
  if existing is not null then
    update public.server_invites set token = code where server_id = p_server;
  else
    insert into public.server_invites (token, server_id, inviter_id) values (code, p_server, me);
  end if;
  return code;
end;
$$;
grant execute on function public.create_server_invite(uuid) to authenticated;

-- Invite preview: add banner_url + online_count for the embed card.
drop function if exists public.get_server_invite(text);
create or replace function public.get_server_invite(p_token text)
returns table(server_id uuid, public_id text, name text, icon_url text, banner_url text,
  is_verified boolean, member_count int, online_count int, inviter_username text)
language sql stable security definer set search_path = public as $$
  select s.id, s.public_id::text, s.name, s.icon_url, s.banner_url, s.is_verified,
    (select count(*)::int from public.server_members sm where sm.server_id = s.id),
    (select count(*)::int from public.server_members sm
       join public.profiles pp on pp.id = sm.profile_id
       where sm.server_id = s.id and pp.last_seen is not null
         and pp.last_seen > now() - interval '5 minutes'),
    p.username
  from public.server_invites i
  join public.servers s on s.id = i.server_id
  join public.profiles p on p.id = i.inviter_id
  where i.token = p_token;
$$;
grant execute on function public.get_server_invite(text) to anon, authenticated;
