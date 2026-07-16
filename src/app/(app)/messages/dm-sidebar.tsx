import { getT }            from '@/lib/i18n';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { RealtimeConversationList } from './realtime-conversation-list';

/**
 * Persistent DM sidebar (blue zone): conversation list. The account panel now
 * lives in the shell, spanning the rail + sidebar columns.
 */
export async function DmSidebar() {
  const t = await getT('messages');
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: convRows } = await (supabase as any)
    .rpc('get_my_conversations', { my_id: user.id });

  const conversations = (convRows ?? []).map((r: any) => ({
    id: r.conversation_id,
    routeId:     r.is_group ? r.conv_public_id : r.other_public_id,
    isGroup:     r.is_group,
    groupName:   r.group_name,
    groupAvatar: r.group_avatar,
    memberCount: r.member_count,
    otherUser: {
      id:           r.other_id,
      public_id:    r.other_public_id,
      username:     r.other_username,
      display_name: r.other_display_name,
      avatar_url:   r.other_avatar_url,
      is_verified:  r.other_is_verified,
      is_moderator: r.other_is_moderator,
      is_premium:   r.other_is_premium,
      is_bot:       r.other_is_bot,
      status:       r.other_status,
      last_seen:    r.other_last_seen,
      custom_status: r.other_custom_status,
    },
    pinned: r.pinned,
    muted:  r.muted,
    unreadCount: r.unread_count ?? 0,
  }));

  return (
    <div className="flex h-full flex-col">
      {/* Conversation list */}
      <div className="min-h-0 flex-1">
        <RealtimeConversationList
          initialConversations={conversations}
          dmLabel={t('directMessages')}
          newDmLabel={t('newMessage')}
          emptyLabel={t('noConversations')}
          myId={user.id}
        />
      </div>
    </div>
  );
}
