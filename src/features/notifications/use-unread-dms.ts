'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient, getBrowserUser } from '@/lib/supabase/client';
import { getMyConversations } from '@/lib/supabase/my-conversations';

export interface UnreadDM {
  conversationId: string;
  isGroup: boolean;
  publicId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  count: number;
}

type Meta = Omit<UnreadDM, 'count'>;

/**
 * Live list of conversations with unread messages, including the other user's
 * avatar — used to surface unread DMs as avatars in the icon rail (Discord-style).
 */
export function useUnreadDMs(): UnreadDM[] {
  const [items, setItems] = useState<UnreadDM[]>([]);
  const pathname = usePathname();

  const sbRef     = useRef(createClient());
  const myIdRef   = useRef<string | null>(null);
  const metaRef   = useRef<Map<string, Meta>>(new Map());
  const countsRef = useRef<Record<string, number>>({});
  const activeRef = useRef<string | null>(null);
  const justReadRef = useRef<Set<string>>(new Set());
  const chanId    = useRef(`dm-rail-badge-${Math.random().toString(36).slice(2)}`);
  // Message ids already counted, so the own INSERT channel and the notifier's
  // `prosto:dm-message` event (a fallback for when that channel didn't
  // subscribe) never double-increment the same message.
  const seenMsgRef = useRef<Set<string>>(new Set());

  const match = pathname.match(/^\/messages\/([^/]+)/);
  const activePublicId = match ? match[1] : null;

  function rebuild() {
    const meta = metaRef.current;
    const counts = countsRef.current;
    const list: UnreadDM[] = [];
    for (const [convId, c] of Object.entries(counts)) {
      if (c <= 0) continue;
      const m = meta.get(convId);
      if (m) list.push({ ...m, count: c });
    }
    setItems(list);
  }

  useEffect(() => {
    const sb = sbRef.current;
    let active = true;

    async function loadConvs(force = false) {
      const user = await getBrowserUser();
      if (!user) return;
      myIdRef.current = user.id;
      const data = await getMyConversations(user.id, force);
      if (!active || !data) return;
      const m = new Map<string, Meta>();
      const counts: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.forEach((r: any) => {
        const isGroup = !!r.is_group;
        m.set(r.conversation_id, {
          conversationId: r.conversation_id,
          isGroup,
          publicId:       isGroup ? r.conv_public_id : r.other_public_id,
          username:       isGroup ? '' : (r.other_username ?? ''),
          displayName:    isGroup ? (r.group_name ?? null) : r.other_display_name,
          avatarUrl:      isGroup ? (r.group_avatar ?? null) : r.other_avatar_url,
          isVerified:     isGroup ? false : !!r.other_is_verified,
        });
        // Seed unread from the DB (survives reloads / offline).
        // Self-healing suppression (see RealtimeConversationList for the full
        // rationale): release justReadRef once the DB confirms the conversation
        // is read (unread === 0), so a dead realtime INSERT can't suppress the
        // rail badge forever. A new message then re-lights it via the poll.
        const unread = Number(r.unread_count ?? 0);
        if (unread <= 0) { justReadRef.current.delete(r.conversation_id); return; }
        if (r.conversation_id === activeRef.current) return;
        if (justReadRef.current.has(r.conversation_id)) return;
        counts[r.conversation_id] = unread;
      });
      metaRef.current = m;
      countsRef.current = counts;
      rebuild();
    }

    loadConvs();

    const ch = sb
      .channel(chanId.current)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, async (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = payload.new as any;
        const me  = myIdRef.current;
        if (!me || raw.sender_id === me) return;
        const convId = raw.conversation_id as string;
        // The open conversation's ChatWindow owns marking itself read (on open,
        // per message and on leave). Don't double-mark or count it here.
        if (convId === activeRef.current) return;
        if (raw.id && seenMsgRef.current.has(raw.id)) return; // already counted (via notifier event)
        if (raw.id) seenMsgRef.current.add(raw.id);
        // A genuinely new message clears any "just read" suppression.
        justReadRef.current.delete(convId);
        if (!metaRef.current.has(convId)) await loadConvs(true);
        countsRef.current = { ...countsRef.current, [convId]: (countsRef.current[convId] ?? 0) + 1 };
        rebuild();
      })
      // My OWN participant row updating (last_read_at) = I read this conversation
      // somewhere (another tab, the web app, another device). RLS exposes only my
      // rows, so this reliably clears the rail/desktop/favicon badge everywhere —
      // fixes the desktop icon lingering after reading in the web app.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = payload.new as any;
        const me = myIdRef.current;
        if (!me || row?.profile_id !== me) return;
        const convId = row.conversation_id as string;
        if (!countsRef.current[convId]) return;
        const next = { ...countsRef.current };
        delete next[convId];
        countsRef.current = next;
        rebuild();
      })
      .subscribe();

    // The open ChatWindow tells us it marked a conversation read → clear its
    // badge immediately instead of waiting for the next poll (kills the "unread
    // comes back" flash on tab switch).
    const onConvRead = (e: Event) => {
      const convId = (e as CustomEvent).detail?.conversationId as string | undefined;
      if (!convId) return;
      justReadRef.current.add(convId);
      if (!countsRef.current[convId]) return;
      const next = { ...countsRef.current };
      delete next[convId];
      countsRef.current = next;
      rebuild();
    };
    window.addEventListener('prosto:conv-read', onConvRead as EventListener);

    // Reliable unread signal from the message notifier (its realtime channel is
    // proven live by the sound). Bumps the rail badge instantly even if THIS
    // hook's own direct_messages channel failed to subscribe.
    const onDmMessage = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { conversationId?: string; messageId?: string } | undefined;
      const convId = detail?.conversationId;
      if (!convId || convId === activeRef.current) return;
      if (detail?.messageId && seenMsgRef.current.has(detail.messageId)) return; // already counted (via own channel)
      if (detail?.messageId) seenMsgRef.current.add(detail.messageId);
      justReadRef.current.delete(convId);
      if (!metaRef.current.has(convId)) await loadConvs(true);
      countsRef.current = { ...countsRef.current, [convId]: (countsRef.current[convId] ?? 0) + 1 };
      rebuild();
    };
    window.addEventListener('prosto:dm-message', onDmMessage as EventListener);

    const poll = setInterval(() => { void loadConvs(true); }, 60000);

    return () => {
      active = false;
      sb.removeChannel(ch);
      window.removeEventListener('prosto:conv-read', onConvRead as EventListener);
      window.removeEventListener('prosto:dm-message', onDmMessage as EventListener);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Clear unread for the conversation currently open. */
  useEffect(() => {
    activeRef.current = null;
    if (!activePublicId) return;
    for (const [convId, m] of metaRef.current.entries()) {
      if (m.publicId === activePublicId) {
        activeRef.current = convId;
        justReadRef.current.add(convId);
        // Persist read state so it stays read after reload / on other devices.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sbRef.current as any).rpc('mark_conversation_read', { conv_id: convId });
        if (countsRef.current[convId]) {
          const next = { ...countsRef.current };
          delete next[convId];
          countsRef.current = next;
          rebuild();
        }
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePublicId, items.length]);

  return items;
}
