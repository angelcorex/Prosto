'use client';

import { useEffect, useState } from 'react';
import type { ReactionGroup } from '@/components/ui/reaction-bar';
import type { ChannelMessage } from './use-channel-messages';

interface UseChannelReactionsOptions {
  channelId: string;
  messages: ChannelMessage[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbRef: React.MutableRefObject<any>;
}

interface UseChannelReactionsResult {
  reactions: Map<string, ReactionGroup[]>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
}

function buildReactionMap(data: unknown[]): Map<string, ReactionGroup[]> {
  const map = new Map<string, ReactionGroup[]>();
  for (const r of data as Record<string, unknown>[]) {
    const key = r.message_id as string;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      emoji: r.emoji as string,
      count: Number(r.reaction_count),
      reacted: !!r.reacted,
    });
  }
  return map;
}

export function useChannelReactions({
  channelId,
  messages,
  sbRef,
}: UseChannelReactionsOptions): UseChannelReactionsResult {
  const [reactions, setReactions] = useState<Map<string, ReactionGroup[]>>(new Map());

  useEffect(() => {
    const ids = messages.filter((m) => !m.id.startsWith('opt-')).map((m) => m.id);
    if (ids.length === 0) return;
    const sb = sbRef.current;
    let active = true;

    async function loadReactions() {
      const { data } = await sb.rpc('get_message_reactions', { p_messages: ids, p_source: 'channel' });
      if (!active || !Array.isArray(data)) return;
      setReactions(buildReactionMap(data));
    }

    loadReactions();

    const reactionCh = sb
      .channel(`ch-reactions:${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: `source=eq.channel` },
        () => { loadReactions(); },
      )
      .subscribe();

    return () => {
      active = false;
      sb.removeChannel(reactionCh);
    };
    // messages.length covers new messages arriving without full dep array churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, channelId]);

  async function toggleReaction(messageId: string, emoji: string) {
    // Optimistic update
    setReactions((prev) => {
      const next = new Map(prev);
      const list = next.get(messageId) ?? [];
      const existing = list.find((r) => r.emoji === emoji);
      if (existing) {
        const updated = list
          .map((r) =>
            r.emoji === emoji
              ? { ...r, count: r.reacted ? r.count - 1 : r.count + 1, reacted: !r.reacted }
              : r,
          )
          .filter((r) => r.count > 0);
        next.set(messageId, updated);
      } else {
        next.set(messageId, [...list, { emoji, count: 1, reacted: true }]);
      }
      return next;
    });
    await sbRef.current.rpc('toggle_message_reaction', {
      p_message: messageId,
      p_source: 'channel',
      p_emoji: emoji,
    });
  }

  return { reactions, toggleReaction };
}
