'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { getMyConversations } from '@/lib/supabase/my-conversations';
import { hideConversation, togglePinConversation, toggleMuteConversation } from './[id]/actions';
import { ConversationList } from './conversation-list';

interface Conversation {
  id: string;
  routeId?: string | null;
  isGroup?: boolean;
  groupName?: string | null;
  groupAvatar?: string | null;
  memberCount?: number;
  otherUser: {
    id?: string;
    public_id?: string | null;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    is_moderator?: boolean;
    is_premium?: boolean;
    is_bot?: boolean;
    status?: string | null;
    last_seen?: string | null;
    custom_status?: string | null;
  };
  pinned?: boolean;
  muted?: boolean;
  unreadCount?: number;
}

interface Props {
  initialConversations: Conversation[];
  dmLabel: string;
  newDmLabel: string;
  emptyLabel: string;
  myId?: string;
}

export function RealtimeConversationList({
  initialConversations,
  dmLabel,
  newDmLabel,
  emptyLabel,
  myId,
}: Props) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [unread, setUnread] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      initialConversations.filter(c => (c.unreadCount ?? 0) > 0).map(c => [c.id, true]),
    ),
  );
  const [typing, setTyping] = useState<Record<string, string[]>>({});
  const pathname = usePathname();
  const router   = useRouter();
  const sbRef    = useRef(createClient());
  const typersRef = useRef<Map<string, Map<string, string>>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingChannelsRef = useRef<Map<string, ReturnType<ReturnType<typeof createClient>['channel']>>>(new Map());

  useEffect(() => { setConversations(initialConversations); }, [initialConversations]);

  const match          = pathname.match(/^\/messages\/([^/]+)/);
  const activePublicId = match ? match[1] : null;
  const activeConvId   = conversations.find(c => (c.routeId ?? c.otherUser.public_id) === activePublicId)?.id ?? null;
  const activeConvRef  = useRef<string | null>(null);
  useEffect(() => { activeConvRef.current = activeConvId; }, [activeConvId]);

  // Conversations the user just read (via the open ChatWindow). We suppress
  // their unread even if a poll's get_my_conversations races ahead of the
  // mark_conversation_read commit — otherwise the badge flashes back on.
  const justReadRef = useRef<Set<string>>(new Set());

  // Clear unread when a conversation becomes active
  useEffect(() => {
    if (activeConvId) {
      justReadRef.current.add(activeConvId);
      setUnread(prev => {
        if (!prev[activeConvId]) return prev;
        const next = { ...prev };
        delete next[activeConvId];
        return next;
      });
    }
  }, [activeConvId]);

  // The open ChatWindow marked a conversation read → clear + remember, so the
  // 30s poll below can't resurrect it before last_read_at commits.
  useEffect(() => {
    const onConvRead = (e: Event) => {
      const convId = (e as CustomEvent).detail?.conversationId as string | undefined;
      if (!convId) return;
      justReadRef.current.add(convId);
      setUnread(prev => {
        if (!prev[convId]) return prev;
        const next = { ...prev };
        delete next[convId];
        return next;
      });
    };
    window.addEventListener('prosto:conv-read', onConvRead as EventListener);
    return () => window.removeEventListener('prosto:conv-read', onConvRead as EventListener);
  }, []);

  // Reliable unread signal from the message notifier (its realtime channel is
  // proven live by the notification sound). Lights the badge instantly even if
  // THIS component's own dm-inbox channel failed to subscribe.
  useEffect(() => {
    const onDmMessage = (e: Event) => {
      const convId = (e as CustomEvent).detail?.conversationId as string | undefined;
      if (!convId || convId === activeConvRef.current) return;
      justReadRef.current.delete(convId);
      setUnread(prev => (prev[convId] ? prev : { ...prev, [convId]: true }));
    };
    window.addEventListener('prosto:dm-message', onDmMessage as EventListener);
    return () => window.removeEventListener('prosto:dm-message', onDmMessage as EventListener);
  }, []);

  useEffect(() => {
    if (!myId) return;
    const sb = sbRef.current;

    async function refreshList(force = false) {
      const data = await getMyConversations(myId!, force);
      if (!data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: Conversation[] = data.map((r: any) => ({
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
      setConversations(prev => {
        // Keep existing order; refresh presence/fields; add new; drop removed.
        const byId = new Map(mapped.map(c => [c.id, c]));
        const kept = prev
          .filter(c => byId.has(c.id))
          .map(c => byId.get(c.id)!);          // updated data, original order
        const keptIds = new Set(kept.map(c => c.id));
        const added = mapped.filter(c => !keptIds.has(c.id)); // new conversations on top
        return [...added, ...kept];
      });
      // Sync unread from the DB (source of truth, survives reloads).
      //
      // Self-healing suppression: `justReadRef` stops a racing poll from
      // flashing the badge back on right after you open a chat (before
      // mark_conversation_read commits). But it must be RELEASED once the DB
      // confirms the conversation is actually read (unread_count === 0) —
      // otherwise, if the realtime INSERT that used to clear it never arrives
      // (e.g. this client's dm-inbox channel didn't subscribe), the poll would
      // suppress the badge FOREVER for every conversation you've opened. That
      // was the "message arrives with sound but no highlight" bug. After the
      // release, a genuinely new message (unread_count > 0) lights up again.
      setUnread(() => {
        const u: Record<string, boolean> = {};
        mapped.forEach(c => {
          const hasUnread = (c.unreadCount ?? 0) > 0;
          if (!hasUnread) { justReadRef.current.delete(c.id); return; } // confirmed read → stop suppressing
          if (c.id === activeConvRef.current) return;                   // currently viewing it
          if (justReadRef.current.has(c.id)) return;                    // just read, DB not caught up yet
          u[c.id] = true;
        });
        return u;
      });
    }

    refreshList();

    // ── New conversation (someone added me as participant) ──
    const partChannel = sb
      .channel(`conv-parts:${myId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'conversation_participants',
        filter: `profile_id=eq.${myId}`,
      }, () => { refreshList(true); })
      .subscribe();

    // ── New message in any of my conversations (RLS limits to mine) ──
    const msgChannel = sb
      .channel(`dm-inbox:${myId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'direct_messages',
      }, async (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw    = payload.new as any;
        const convId = raw.conversation_id;
        const fromMe = raw.sender_id === myId;

        // Mark unread unless it's my own message or the open conversation.
        // A genuinely new message clears the "just read" suppression.
        if (!fromMe && convId !== activeConvRef.current) {
          justReadRef.current.delete(convId);
          setUnread(prev => ({ ...prev, [convId]: true }));
        }

        // Move the conversation that received a message to the top
        // (pinned conversations always stay above the rest).
        setConversations(prev => {
          const moved = prev.find(c => c.id === convId);
          if (!moved) return prev;
          const rest  = prev.filter(c => c.id !== convId);
          return [moved, ...rest].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
        });

        // Re-pull the list so a hidden/new conversation appears too
        await refreshList(true);
      })
      .subscribe();

    // ── My own read state changed on another device → clear unread here ──
    const readChannel = sb
      .channel(`read-sync:${myId}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'conversation_participants',
        filter: `profile_id=eq.${myId}`,
      }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const convId = (payload.new as any)?.conversation_id;
        if (!convId) return;
        setUnread(prev => {
          if (!prev[convId]) return prev;
          const next = { ...prev };
          delete next[convId];
          return next;
        });
      })
      .subscribe();

    // ── Polling fallback (works even if realtime isn't configured) ──
    const poll = setInterval(() => { void refreshList(true); }, 30000);

    return () => {
      sb.removeChannel(partChannel);
      sb.removeChannel(msgChannel);
      sb.removeChannel(readChannel);
      clearInterval(poll);
    };
  }, [myId]);

  /* ── Typing indicators for every conversation (instant broadcast) ──
       This list is always mounted, so it owns the single typing channel per
       conversation. The open chat window sends/receives through window events
       to avoid subscribing to the same realtime topic twice on one client. ── */
  const convIdsKey = conversations.map(c => c.id).sort().join(',');
  useEffect(() => {
    if (!myId) return;
    const sb = sbRef.current;
    const timers = typingTimersRef.current;
    const chMap  = typingChannelsRef.current;

    const channels = conversations.map(conv => {
      const ch = sb.channel(`typing:${conv.id}`, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { from?: string; name?: string; typing?: boolean } | undefined;
        if (!p || !p.from || p.from === myId) return;

        // Forward to the open chat window for this conversation.
        window.dispatchEvent(new CustomEvent('prosto:typing', {
          detail: { conversationId: conv.id, from: p.from, name: p.name, typing: p.typing },
        }));

        const timerKey = `${conv.id}:${p.from}`;
        const existing = timers.get(timerKey);
        if (existing) clearTimeout(existing);

        function publish() {
          const map = typersRef.current.get(conv.id);
          const names = map ? Array.from(map.values()) : [];
          setTyping(prev => {
            if (names.length === 0) { const n = { ...prev }; delete n[conv.id]; return n; }
            return { ...prev, [conv.id]: names };
          });
        }

        if (p.typing) {
          let map = typersRef.current.get(conv.id);
          if (!map) { map = new Map(); typersRef.current.set(conv.id, map); }
          map.set(p.from, p.name || '');
          publish();
          timers.set(timerKey, setTimeout(() => {
            const mm = typersRef.current.get(conv.id);
            if (mm) { mm.delete(p.from as string); if (mm.size === 0) typersRef.current.delete(conv.id); }
            timers.delete(timerKey);
            publish();
          }, 5000));
        } else {
          const mm = typersRef.current.get(conv.id);
          if (mm) { mm.delete(p.from); if (mm.size === 0) typersRef.current.delete(conv.id); }
          timers.delete(timerKey);
          publish();
        }
      }).subscribe();
      chMap.set(conv.id, ch);
      return ch;
    });

    // The chat window asks us to broadcast its typing state.
    function onSend(e: Event) {
      const d = (e as CustomEvent).detail as { conversationId?: string; from?: string; name?: string; typing?: boolean } | undefined;
      if (!d?.conversationId) return;
      const ch = chMap.get(d.conversationId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (ch) (ch as any).send({ type: 'broadcast', event: 'typing', payload: { from: d.from, name: d.name, typing: d.typing } });
    }
    window.addEventListener('prosto:send-typing', onSend as EventListener);

    return () => {
      window.removeEventListener('prosto:send-typing', onSend as EventListener);
      channels.forEach(ch => sb.removeChannel(ch));
      chMap.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convIdsKey, myId]);

  async function handleHide(convId: string) {
    // Optimistic removal
    setConversations(prev => prev.filter(c => c.id !== convId));
    await hideConversation(convId);
    if (activeConvId === convId) router.push('/messages');
    router.refresh();
  }

  async function handleTogglePin(convId: string, pinned: boolean) {
    setConversations(prev => {
      const next = prev.map(c => (c.id === convId ? { ...c, pinned } : c));
      return [...next].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    });
    await togglePinConversation(convId, pinned);
    router.refresh();
  }

  async function handleToggleMute(convId: string, muted: boolean) {
    setConversations(prev => prev.map(c => (c.id === convId ? { ...c, muted } : c)));
    await toggleMuteConversation(convId, muted);
    router.refresh();
  }

  return (
    <ConversationList
      conversations={conversations}
      activeId={activePublicId ?? null}
      unread={unread}
      typing={typing}
      dmLabel={dmLabel}
      newDmLabel={newDmLabel}
      emptyLabel={emptyLabel}
      onHide={handleHide}
      onTogglePin={handleTogglePin}
      onToggleMute={handleToggleMute}
    />
  );
}
