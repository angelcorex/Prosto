import { redirect }     from 'next/navigation';
import { createClient, getCurrentUser, getCurrentProfile }  from '@/lib/supabase/server';
import { getT }          from '@/lib/i18n';
import { getLocale }     from '@/lib/i18n/request';
import { stripEmojiTokens } from '@/lib/utils/display-name';
import { ChatWindow }    from './chat-window';

interface Props { params: Promise<{ id: string }> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMessages(supabase: any, convId: string) {
  // Preferred: reliable security-definer RPC (bypasses RLS subtleties).
  const { data, error } = await supabase.rpc('get_conversation_messages', { conv: convId });
  if (!error && Array.isArray(data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((m: any) => ({
      id: m.id, content: m.content, created_at: m.created_at, sender_id: m.sender_id,
      type: m.type ?? 'text', call_seconds: m.call_seconds ?? null, reply_to: m.reply_to ?? null,
      edited_at: m.edited_at ?? null, pinned_at: m.pinned_at ?? null,
      sender: { username: m.sender_username, display_name: m.sender_display_name, avatar_url: m.sender_avatar_url, is_verified: m.sender_is_verified, is_moderator: m.sender_is_moderator, is_premium: m.sender_is_premium },
    }));
  }
  // Fallback: direct select (works even before the RPC migration is applied).
  // Fetch the NEWEST 200 (desc) then reverse to chronological — otherwise an
  // active conversation past 200 messages would only ever show the OLDEST 200
  // and hide everything recent.
  const { data: raw } = await supabase
    .from('direct_messages')
    .select(`id, content, created_at, sender_id, type, call_seconds, reply_to,
      sender:profiles!direct_messages_sender_id_fkey(username, display_name, avatar_url, is_verified, is_moderator, is_premium)`)
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (raw ?? []).map((m: any) => ({
    id: m.id, content: m.content, created_at: m.created_at, sender_id: m.sender_id,
    type: m.type ?? 'text', call_seconds: m.call_seconds ?? null, reply_to: m.reply_to ?? null,
    sender: Array.isArray(m.sender) ? m.sender[0] : m.sender,
  })).reverse();
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  // Independent reads in parallel; getCurrentUser is request-cached (shared with layout).
  const [user, t, locale] = await Promise.all([
    getCurrentUser(),
    getT('messages'),
    getLocale(),
  ]);
  if (!user) return null;

  // The `id` segment is EITHER a group's public_id OR a user's public_id — we
  // don't know which yet. Probe both in parallel instead of serially (group
  // first, user second) so a DM open isn't gated behind a wasted group lookup.
  // The unused branch's query is harmless and adds no latency (runs concurrently).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [groupRes, otherRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_group', { gpid: id }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified, is_moderator, is_premium, is_bot, status, last_seen, custom_status')
      .eq('public_id', id)
      .maybeSingle(),
  ]);
  const groupRows = groupRes.data;
  const group = Array.isArray(groupRows) ? groupRows[0] : groupRows;

  if (group?.conversation_id) {
    const convId = group.conversation_id as string;

    // Messages, members and my profile don't depend on each other — fetch together.
    // getCurrentProfile is request-cached, so it reuses the layout's profile read.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // NOTE: read state is marked CLIENT-SIDE by ChatWindow on mount (and on
    // leave), so it's intentionally NOT marked here. Keeping it out of the
    // server render means this route can be safely prefetched on hover (for
    // instant open) without a hover marking the conversation read.
    const [messages, membersRes, myProfile] = await Promise.all([
      loadMessages(supabase, convId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc('get_conversation_members', { conv: convId }),
      getCurrentProfile(),
    ]);
    const memberRows = membersRes?.data;

    return (
      <ChatWindow
        conversationId={convId}
        key={convId}
        initialMessages={messages}
        myProfileId={myProfile?.id ?? ''}
        myProfile={myProfile}
        otherUser={null}
        group={{
          conversationId: convId,
          publicId:       id,
          name:           group.name ?? null,
          avatar:         group.avatar_url ?? null,
          memberCount:    group.member_count ?? 0,
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        members={(memberRows ?? []).map((m: any) => ({
          id:           m.id,
          username:     m.username,
          display_name: m.display_name,
          avatar_url:   m.avatar_url,
          is_verified:  m.is_verified,
          is_moderator: m.is_moderator,
          is_premium:   m.is_premium,
          is_bot:       m.is_bot,
          status:       m.status,
          last_seen:    m.last_seen,
          is_owner:     m.is_owner,
        }))}
        locale={locale}
        placeholderLabel={t('messagePlaceholder', { name: stripEmojiTokens(group.name ?? t('unnamedGroup')) })}
      />
    );
  }

  // Not a group → the segment is the other user's numeric public_id (already
  // fetched in parallel above).
  const other = otherRes.data;

  if (!other || other.id === user.id) redirect('/messages');

  // Resolve the conversation. FAST PATH FIRST: `find_dm_conversation` is a plain
  // read; the overwhelming common case (you already have a thread with someone)
  // resolves in one cheap SELECT. Only when NO thread exists do we fall back to
  // `ensure_dm` — the advisory-locked WRITE that creates it (migration 116, the
  // single canonical creation path that fixed the duplicate-conversation bug).
  //
  // Why the order matters for speed: this route is hover-prefetched, and a write
  // with an advisory lock on every hover/open was the reason DM opens dragged
  // while channels (pure reads) felt instant. A read-first path makes the hot
  // case as cheap as a channel open.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any).rpc('find_dm_conversation', {
    user_a: user.id,
    user_b: other.id,
  });

  let convId: string | null = (existing as string) ?? null;

  if (convId) {
    // Un-hide it for me (I may have previously closed the DM). Fire-and-forget
    // is fine — it doesn't gate the message load.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from('conversation_participants')
      .update({ hidden: false })
      .eq('conversation_id', convId)
      .eq('profile_id', user.id);
  } else {
    // No thread yet → create it via the canonical advisory-locked path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ensured, error: ensureErr } = await (supabase as any).rpc('ensure_dm', { other: other.id });
    if (ensureErr && process.env.NODE_ENV === 'development') {
      console.error('[ensure_dm]', ensureErr.message);
    }
    convId = (ensured as string) ?? null;
  }

  if (!convId) redirect('/messages');

  const otherUser = {
    id:            other.id,
    public_id:     id,
    username:      other.username,
    display_name:  other.display_name,
    avatar_url:    other.avatar_url,
    is_verified:   other.is_verified,
    is_moderator:  other.is_moderator,
    is_premium:    other.is_premium,
    is_bot:        other.is_bot,
    status:        other.status,
    last_seen:     other.last_seen,
    custom_status: other.custom_status,
  };

  // Messages + my profile (cached, reused from layout) in parallel.
  // Read state is marked CLIENT-SIDE by ChatWindow (mount + leave), so it's
  // intentionally NOT marked here — that keeps this route safe to prefetch on
  // hover (instant open) without a hover marking the conversation read.
  const [messages, myProfile, readAtRes] = await Promise.all([
    loadMessages(supabase, convId),
    getCurrentProfile(),
    // The other user's last_read_at, so the read receipt is correct on first
    // paint (no flicker waiting for the client poll).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_dm_read_at', { conv: convId }),
  ]);

  return (
    <ChatWindow
      conversationId={convId}
      key={convId}
      initialMessages={messages}
      myProfileId={myProfile?.id ?? ''}
      myProfile={myProfile}
      otherUser={otherUser}
      initialOtherReadAt={(readAtRes?.data as string | null) ?? null}
      locale={locale}
      placeholderLabel={otherUser ? t('messagePlaceholder', { name: stripEmojiTokens(otherUser.display_name ?? otherUser.username) }) : t('typeMessage')}
    />
  );
}
