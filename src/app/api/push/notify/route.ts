import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push/send';
import { limitRequest } from '@/lib/rate-limit/ip';

export const runtime = 'nodejs';

/**
 * POST /api/push/notify  { kind: 'dm' | 'channel', messageId: string }
 *
 * Fired (fire-and-forget) by the sender's browser right after a message is
 * stored, to deliver a background Web Push to the OTHER participants — so a
 * notification arrives even when their app is closed. The message is re-read
 * server-side (authoritative), recipients are resolved from the DB, and DnD /
 * muted recipients are skipped. Channels push only on a mention (background
 * spam otherwise); DMs always push the other participant(s).
 *
 * Auth: the caller must be the message's sender. No-op (200) when push isn't
 * configured, so the client can always call it.
 */
export async function POST(request: NextRequest) {
  const limited = limitRequest(request, 'push-notify', 60, 10_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { kind?: string; messageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { kind, messageId } = body;
  if ((kind !== 'dm' && kind !== 'channel') || typeof messageId !== 'string') {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = createAdminClient();

  if (kind === 'dm') {
    await notifyDm(admin, user.id, messageId);
  } else {
    await notifyChannel(admin, user.id, messageId);
  }
  return NextResponse.json({ ok: true });
}

/** Preview text for a message body (hide URLs/stickers/attachments). */
function preview(content: string): string {
  const c = (content ?? '').trim();
  if (!c) return 'Attachment';
  if (c.startsWith('sticker:')) return 'Sticker';
  if (/^https?:\/\/\S+$/i.test(c)) return 'Attachment';
  return c.slice(0, 140);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyDm(admin: any, senderId: string, messageId: string) {
  const { data: msg } = await admin
    .from('direct_messages')
    .select('id, conversation_id, sender_id, content, type')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg || msg.sender_id !== senderId || msg.type === 'system') return;

  // Conversation route id + name/avatar, and the sender's display name.
  const [{ data: conv }, { data: sender }, { data: parts }] = await Promise.all([
    admin.from('conversations').select('public_id, is_group, name, avatar_url').eq('id', msg.conversation_id).maybeSingle(),
    admin.from('profiles').select('display_name, username, avatar_url').eq('id', senderId).maybeSingle(),
    admin.from('conversation_participants')
      .select('profile_id, muted, profiles!inner(status)')
      .eq('conversation_id', msg.conversation_id),
  ]);
  if (!conv || !parts) return;

  const senderName = sender?.display_name || sender?.username || 'Someone';
  const title = conv.is_group ? (conv.name || senderName) : senderName;
  const text = conv.is_group ? `${senderName}: ${preview(msg.content)}` : preview(msg.content);
  const url = conv.public_id ? `/messages/${conv.public_id}` : '/messages';
  const icon = conv.is_group ? (conv.avatar_url ?? null) : (sender?.avatar_url ?? null);

  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parts.map(async (p: any) => {
      if (p.profile_id === senderId || p.muted) return;
      const status = Array.isArray(p.profiles) ? p.profiles[0]?.status : p.profiles?.status;
      if (status === 'dnd') return;
      await sendPushToUser(p.profile_id, { title, body: text, url, icon, tag: `dm:${msg.conversation_id}` });
    }),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyChannel(admin: any, senderId: string, messageId: string) {
  const { data: msg } = await admin
    .from('channel_messages')
    .select('id, channel_id, sender_id, content')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg || msg.sender_id !== senderId) return;

  // Background push for channels only on a real ping — otherwise it's spam.
  // The send_channel_message RPC already created 'mention' notifications with
  // message_id = this message; use them as the authoritative recipient list.
  const { data: mentions } = await admin
    .from('notifications')
    .select('user_id')
    .eq('type', 'mention')
    .eq('message_id', messageId);
  if (!mentions || mentions.length === 0) return;

  const [{ data: ch }, { data: sender }] = await Promise.all([
    admin.from('server_channels')
      .select('name, public_id, servers!inner(public_id)')
      .eq('id', msg.channel_id).maybeSingle(),
    admin.from('profiles').select('display_name, username, avatar_url').eq('id', senderId).maybeSingle(),
  ]);
  const srv = ch?.servers ? (Array.isArray(ch.servers) ? ch.servers[0] : ch.servers) : null;
  const senderName = sender?.display_name || sender?.username || 'Someone';
  const title = ch?.name ? `#${ch.name}` : 'Mention';
  const text = `${senderName}: ${preview(msg.content)}`;
  const url = srv?.public_id && ch?.public_id
    ? `/s/${srv.public_id}/${ch.public_id}?m=${msg.id}`
    : '/';

  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mentions.map(async (m: any) => {
      if (m.user_id === senderId) return;
      const { data: p } = await admin.from('profiles').select('status').eq('id', m.user_id).maybeSingle();
      if (p?.status === 'dnd') return;
      await sendPushToUser(m.user_id, { title, body: text, url, icon: sender?.avatar_url ?? null, tag: `chan:${msg.channel_id}` });
    }),
  );
}
