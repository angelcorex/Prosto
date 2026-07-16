-- External account connections (Spotify now; Twitter/etc. can be added later).
-- Tokens are never exposed to the client: all client access goes through the
-- security-definer RPCs below (scoped to auth.uid()) or the service role.

create table if not exists public.connections (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  provider         text not null,
  provider_user_id text,
  provider_username text,
  provider_url     text,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  scopes           text,
  show_on_profile  boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (profile_id, provider)
);

alter table public.connections enable row level security;
-- No client policies: direct table access is denied. The RPCs (security
-- definer) and the service role are the only ways in.

-- Current user's connections (safe columns) for the settings screen.
create or replace function public.get_my_connections()
returns table(provider text, provider_username text, provider_url text, show_on_profile boolean)
language sql stable security definer set search_path = public as $$
  select c.provider, c.provider_username, c.provider_url, c.show_on_profile
  from public.connections c
  where c.profile_id = auth.uid()
  order by c.created_at asc;
$$;
grant execute on function public.get_my_connections() to authenticated;

-- Public connections (safe columns) shown on a profile.
create or replace function public.get_profile_connections(p_username text)
returns table(provider text, provider_username text, provider_url text)
language sql stable security definer set search_path = public as $$
  select c.provider, c.provider_username, c.provider_url
  from public.connections c
  join public.profiles p on p.id = c.profile_id
  where p.username = p_username and c.show_on_profile = true
  order by c.created_at asc;
$$;
grant execute on function public.get_profile_connections(text) to anon, authenticated;

-- Toggle whether a connection is shown on the owner's profile.
create or replace function public.set_connection_visibility(p_provider text, p_show boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  update public.connections set show_on_profile = p_show
  where profile_id = me and provider = p_provider;
end;
$$;
grant execute on function public.set_connection_visibility(text, boolean) to authenticated;

-- Disconnect (remove) a connection for the current user.
create or replace function public.disconnect_connection(p_provider text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated'; end if;
  delete from public.connections where profile_id = me and provider = p_provider;
end;
$$;
grant execute on function public.disconnect_connection(text) to authenticated;
