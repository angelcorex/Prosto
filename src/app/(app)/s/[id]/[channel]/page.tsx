import { redirect } from 'next/navigation';

import { Lock } from 'lucide-react';

import { createClient, getCurrentUser, getCurrentProfile } from '@/lib/supabase/server';
import { getLocale } from '@/lib/i18n/request';
import { getT } from '@/lib/i18n';
import { site } from '@/config';
import { isAdultFromBirthDate } from '@/lib/utils/age';
import { ChannelChat } from '@/features/servers';

export default async function ChannelPage({ params }: { params: Promise<{ id: string; channel: string }> }) {
  const { id, channel } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(site.routes.signIn);

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: srv } = await (supabase as any).rpc('get_server', { p_public_id: id });
  const server = Array.isArray(srv) ? srv[0] : srv;
  if (!server) redirect(site.routes.feed);

  // channels, members, profile and locale are independent — fetch them together
  // instead of serially so the channel skeleton clears sooner.
  const [channelsRes, memsRes, profile, locale] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_server_channels', { p_server: server.id }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_server_members', { p_server: server.id }),
    getCurrentProfile(),
    getLocale(),
  ]);

  const isAdult = isAdultFromBirthDate(profile?.birth_date ?? null);
  // 18+ server: the member stays on the server but its channels are withheld —
  // show a lock screen instead of redirecting them away.
  const serverLocked = !!server.is_nsfw && !isAdult;

  const channels = channelsRes?.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = serverLocked ? null : ((channels ?? []).find((c: any) => c.channel_public_id === channel) ?? null);
  if (!serverLocked && !ch) redirect(site.routes.server(id));

  // Age gate: an NSFW server (locked) or an NSFW channel is blocked for
  // under-18 / no-DOB viewers.
  if (serverLocked || (ch?.is_nsfw && !isAdult)) {
    const ta = await getT('age');
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-[18px] font-bold text-foreground">{ta('restrictedTitle')}</h2>
        <p className="max-w-sm text-[14px] text-muted-foreground">{ta('restrictedBody')}</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = (memsRes?.data ?? []).map((u: any) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: msgs } = await (supabase as any).rpc('get_channel_messages', { p_channel: ch.channel_id });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialMessages = (msgs ?? []).map((m: any) => ({
    id: m.id, content: m.content, created_at: m.created_at, sender_id: m.sender_id, reply_to: m.reply_to,
    edited_at: m.edited_at ?? null, pinned_at: m.pinned_at ?? null,
    // Include role colour/gradient/glow/icon so names render styled from the
    // first paint (no repaint when the client refetch lands).
    sender: { username: m.sender_username, display_name: m.sender_display_name, avatar_url: m.sender_avatar_url, is_verified: m.sender_is_verified, is_moderator: m.sender_is_moderator, is_premium: m.sender_is_premium, role_color: m.sender_role_color, role_color2: m.sender_role_color2, role_glow: m.sender_role_glow, role_icon: m.sender_role_icon },
  }));

  return (
    <ChannelChat
      key={ch.channel_id}
      channelId={ch.channel_id}
      channelName={ch.name}
      initialMessages={initialMessages}
      members={members}
      isOwner={!!server.is_owner}
      myPermissions={Number(ch.my_channel_permissions ?? server.my_permissions) || 0}
      serverId={server.id}
      initialTheme={{
        image: ch.theme_image ?? null,
        dim: ch.theme_dim ?? 0.4,
        x: ch.theme_x ?? 100,
        y: ch.theme_y ?? 0,
      }}
      myProfile={profile ? {
        id: profile.id, username: profile.username, display_name: profile.display_name,
        avatar_url: profile.avatar_url, is_verified: profile.is_verified, is_moderator: profile.is_moderator,
        is_premium: profile.is_premium,
      } : null}
      myTimeoutUntil={server.my_timeout_until ?? null}
      myTimeoutReason={server.my_timeout_reason ?? null}
      locale={locale}
    />
  );
}
