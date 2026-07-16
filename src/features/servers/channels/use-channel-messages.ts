'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ChatAttachment } from '@/lib/utils/media';

export interface Sender {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
  is_bot?: boolean;
  role_color?: string | null;
  role_color2?: string | null;
  role_glow?: string | null;
  role_icon?: string | null;
}

export interface ChannelMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  reply_to: string | null;
  sender: Sender | null;
  pending?: boolean;
  failed?: boolean;
  attachments?: ChatAttachment[];
  uploading?: boolean;
  edited_at?: string | null;
  pinned_at?: string | null;
}

interface UseChannelMessagesOptions {
  channelId: string;
  myId: string;
  /** Pre-fetched messages from the server component (avoids initial loading flash). */
  initialMessages?: ChannelMessage[];
}

interface UseChannelMessagesResult {
  messages: ChannelMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChannelMessage[]>>;
  /** Shared Supabase channel ref (also used by useTypingIndicator for broadcasts). */
  chanRef: React.MutableRefObject<ReturnType<ReturnType<typeof createClient>['channel']> | null>;
  sbRef: React.MutableRefObject<ReturnType<typeof createClient>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMessage(m: any): ChannelMessage {
  return {
    id: m.id,
    content: m.content,
    created_at: m.created_at,
    sender_id: m.sender_id,
    reply_to: m.reply_to,
    edited_at: m.edited_at ?? null,
    pinned_at: m.pinned_at ?? null,
    sender: {
      username: m.sender_username,
      display_name: m.sender_display_name,
      avatar_url: m.sender_avatar_url,
      is_verified: m.sender_is_verified,
      is_moderator: m.sender_is_moderator,
      is_premium: m.sender_is_premium,
      is_bot: m.sender_is_bot,
      role_color: m.sender_role_color,
      role_color2: m.sender_role_color2,
      role_glow: m.sender_role_glow,
      role_icon: m.sender_role_icon,
    },
  };
}

export function useChannelMessages({
  channelId,
  myId,
  initialMessages = [],
}: UseChannelMessagesOptions): UseChannelMessagesResult {
  const sbRef = useRef(createClient());
  const chanRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>(initialMessages);

  useEffect(() => {
    const sb = sbRef.current;
    let active = true;

    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_channel_messages', { p_channel: channelId });
      if (!active || !Array.isArray(data)) return;
      const rows: ChannelMessage[] = data.map(rowToMessage);
      setMessages((prev) => {
        const opt = prev.filter(
          (p) => p.id.startsWith('opt-') && !rows.some((r) => r.content === p.content && r.sender_id === myId),
        );
        return [...rows, ...opt];
      });
    }

    load();

    const ch = sb
      .channel(`channel:${channelId}`, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` },
        () => {
          // Refetch on ANY insert — including my own. A message I send from
          // another device (phone) arrives here with my own sender_id but has no
          // optimistic bubble on THIS client; `load()` dedupes optimistic sends
          // by content, so this reconciles cross-device without duplicating. (The
          // old `if sender_id === myId return` dropped phone-sent messages on web
          // until reload.)
          load();
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldId = (payload.old as any)?.id;
          if (oldId) setMessages((prev) => prev.filter((m) => m.id !== oldId));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          if (!row?.id) return;
          setMessages((prev) => prev.map((m) => (m.id === row.id
            ? { ...m, content: row.content, edited_at: row.edited_at ?? null, pinned_at: row.pinned_at ?? null }
            : m)));
        },
      )
      .subscribe();

    chanRef.current = ch;

    // Safety-net poll — realtime is the primary path.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 20000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('prosto:channel-reload', onFocus);

    return () => {
      active = false;
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('prosto:channel-reload', onFocus);
      sb.removeChannel(ch);
      chanRef.current = null;
    };
  }, [channelId, myId]);

  return { messages, setMessages, chanRef, sbRef };
}
