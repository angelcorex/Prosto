import { createClient } from '@/lib/supabase/server';
import { getLocale } from '@/lib/i18n/request';
import { NotificationsClient } from './notifications-client';

export interface NotificationItem {
  id: string;
  type: 'follow' | 'friend_request' | 'friend_accepted' | 'message' | 'mention' | 'like' | 'comment' | 'repost';
  read: boolean;
  created_at: string;
  actor_id: string | null;
  ref_id: string | null;
  message_id: string | null;
  /** Precomputed in-app destination (server-resolved), so the row just links. */
  href: string | null;
  actor: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    is_moderator: boolean;
  } | null;
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const locale = await getLocale();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('notifications')
    .select(`id, type, read, created_at, actor_id, ref_id, message_id,
      actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url, is_verified, is_moderator)`)
    .eq('user_id', user.id)
    .neq('type', 'message')
    .order('created_at', { ascending: false })
    .limit(60);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = data ?? [];

  // Resolve the jump target for every notification, so each row is a link that
  // actually navigates (Telegram-style). A mention's ref_id is either a server
  // channel or a DM conversation; posts link to the post; friend/follow to the
  // actor's profile.
  const mentionRefs = Array.from(
    new Set(rows.filter((n) => n.type === 'mention' && n.ref_id).map((n) => n.ref_id as string)),
  );

  const channelHrefById = new Map<string, string>();   // channel_id → /s/<pid>/<chan>
  const convPidById     = new Map<string, string>();   // conversation_id → public_id
  if (mentionRefs.length > 0) {
    const [chRes, convRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('server_channels')
        .select('id, public_id, server:servers!server_channels_server_id_fkey(public_id)')
        .in('id', mentionRefs),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('conversations')
        .select('id, public_id')
        .in('id', mentionRefs),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chRes.data ?? []).forEach((c: any) => {
      const srv = Array.isArray(c.server) ? c.server[0] : c.server;
      if (srv?.public_id) channelHrefById.set(c.id, `/s/${srv.public_id}/${c.public_id}`);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (convRes.data ?? []).forEach((c: any) => convPidById.set(c.id, String(c.public_id)));
  }

  function hrefFor(n: { type: string; ref_id: string | null; message_id: string | null; actor?: { username?: string } | null }): string | null {
    if (n.type === 'like' || n.type === 'comment' || n.type === 'repost') {
      return n.ref_id ? `/post/${n.ref_id}` : null;
    }
    if (n.type === 'mention' && n.ref_id) {
      const chHref = channelHrefById.get(n.ref_id);
      if (chHref) return n.message_id ? `${chHref}?m=${n.message_id}` : chHref;
      const convPid = convPidById.get(n.ref_id);
      if (convPid) return `/messages/${convPid}`;
      return null;
    }
    if ((n.type === 'follow' || n.type === 'friend_accepted') && n.actor?.username) {
      return `/u/${n.actor.username}`;
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: NotificationItem[] = rows.map((n: any) => {
    const actor = Array.isArray(n.actor) ? n.actor[0] ?? null : n.actor;
    return { ...n, actor, href: hrefFor({ ...n, actor }) };
  });

  // Persist read state server-side, after capturing the unread state above for
  // display. Done here (not only on the client) so it can't be aborted when the
  // user navigates away quickly — which left notifications looking unread again
  // after a tab switch or reload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);

  return <NotificationsClient initialItems={items} myId={user.id} locale={locale} />;
}
