-- ─────────────────────────────────────────────────────────────────────────
-- Split GIFs out of USE_EMOJI into their own permission, and stop gating
-- plain links (which can't be reliably controlled anyway).
--
--   USE_EMOJI (32)  → emoji + stickers
--   USE_GIF   (512) → GIFs / image links rendered as previews
--
-- ALL becomes 1023. Existing @everyone roles get USE_GIF so GIFs keep working.
-- ─────────────────────────────────────────────────────────────────────────

-- Owner implicitly has every permission (now includes USE_GIF).
create or replace function public.server_perms(p_server uuid, p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.servers where id = p_server and owner_id = p_user) then 1023::bigint
    else coalesce((
      select bit_or(r.permissions)
      from public.server_roles r
      where r.server_id = p_server
        and (r.is_default or r.id in (
          select mr.role_id from public.server_member_roles mr where mr.profile_id = p_user
        ))
    ), 0::bigint)
  end;
$$;

-- @everyone baseline now also allows GIFs (184 | 512 = 696).
create or replace function public._ensure_everyone(p_server uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.server_roles (server_id, name, permissions, position, is_default)
  select p_server, '@everyone', 696, 0, true
  where not exists (select 1 from public.server_roles where server_id = p_server and is_default);
end;
$$;

-- Keep existing servers working: grant USE_GIF to every @everyone role.
update public.server_roles set permissions = permissions | 512 where is_default;

-- ── send_channel_message: stickers need USE_EMOJI; links/GIFs are free ──
drop function if exists public.send_channel_message(uuid, text, uuid);
create or replace function public.send_channel_message(p_channel uuid, body text, reply uuid default null)
returns table (msg_id uuid, msg_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); srv uuid; v_id uuid; v_at timestamptz;
begin
  if me is null then raise exception 'unauthenticated'; end if;
  select sc.server_id into srv from public.server_channels sc where sc.id = p_channel;
  if srv is null or not public.is_server_member(srv) then raise exception 'forbidden'; end if;
  if not public.has_perm(srv, 16) then raise exception 'forbidden'; end if;

  perform public.check_rate_limit('message', 15, 10);

  body := trim(body);
  if body = '' or char_length(body) > 2000 then raise exception 'invalid content'; end if;
  -- Stickers require USE_EMOJI. Plain links/GIFs are not gated server-side.
  if body like 'sticker:%' and not public.has_perm(srv, 32) then
    raise exception 'forbidden';
  end if;

  insert into public.channel_messages (channel_id, sender_id, content, reply_to)
  values (p_channel, me, body, reply)
  returning channel_messages.id, channel_messages.created_at into v_id, v_at;

  if body ~* '@everyone([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm where sm.server_id = srv and sm.profile_id <> me;
  elsif body ~* '@here([^a-z0-9_]|$)' then
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm join public.profiles p on p.id = sm.profile_id
    where sm.server_id = srv and sm.profile_id <> me
      and p.last_seen is not null and p.last_seen > now() - interval '2 minutes';
  else
    insert into public.notifications (user_id, type, actor_id, ref_id)
    select sm.profile_id, 'mention', me, p_channel
    from public.server_members sm join public.profiles p on p.id = sm.profile_id
    where sm.server_id = srv and sm.profile_id <> me
      and lower(body) ~ ('@' || lower(p.username) || '([^a-z0-9_]|$)');
  end if;

  insert into public.notifications (user_id, type, actor_id, ref_id)
  select distinct mr.profile_id, 'mention', me, p_channel
  from public.server_roles r
  join public.server_member_roles mr on mr.role_id = r.id
  where r.server_id = srv
    and not r.is_default
    and r.name ~ '^[A-Za-z0-9_]+$'
    and lower(body) ~ ('@' || lower(r.name) || '([^a-z0-9_]|$)')
    and mr.profile_id <> me
    and (
      r.mention_mode = 'everyone'
      or (r.mention_mode = 'selected'
          and exists (select 1 from public.server_role_mention_allow a
                      where a.role_id = r.id and a.profile_id = me))
    );

  msg_id := v_id; msg_created_at := v_at; return next;
end;
$$;
grant execute on function public.send_channel_message(uuid, text, uuid) to authenticated;

-- ── get_channel_messages: also expose the sender's role icon ──
drop function if exists public.get_channel_messages(uuid);
create or replace function public.get_channel_messages(p_channel uuid)
returns table(id uuid, content text, created_at timestamptz, sender_id uuid, reply_to uuid,
  sender_username text, sender_display_name text, sender_avatar_url text,
  sender_is_verified boolean, sender_is_moderator boolean,
  sender_role_color text, sender_role_color2 text, sender_role_glow text, sender_role_icon text)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.created_at, m.sender_id, m.reply_to,
    p.username, p.display_name, p.avatar_url, p.is_verified, p.is_moderator,
    (select r.color from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.color2 from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.color is not null
       order by r.position desc limit 1),
    (select r.glow from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.glow is not null
       order by r.position desc limit 1),
    (select r.icon_url from public.server_roles r join public.server_member_roles mr on mr.role_id = r.id
       where mr.profile_id = p.id and mr.server_id = sc.server_id and r.icon_url is not null
       order by r.position desc limit 1)
  from public.channel_messages m
  join public.profiles p on p.id = m.sender_id
  join public.server_channels sc on sc.id = m.channel_id
  where m.channel_id = p_channel
    and public.is_channel_member(p_channel)
    and public.has_perm(sc.server_id, 128)
  order by m.created_at asc
  limit 200;
$$;
grant execute on function public.get_channel_messages(uuid) to authenticated;
