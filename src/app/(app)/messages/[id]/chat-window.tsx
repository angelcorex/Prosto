'use client';

import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Hash, ImagePlus, Paperclip, Smile, Phone, Reply, MoreHorizontal, Copy, Trash2, CornerUpRight, X, ArrowLeft, Users, UserPlus, UserMinus, Pencil, LogOut, Image as ImageIcon, Sticker as StickerIcon, CheckCheck, Check, Pin, AtSign, Slash, Send } from 'lucide-react';

import { cn }             from '@/lib/utils/cn';
import { attachmentsOf, isStorageUrl, withAttachmentMeta, MAX_CHAT_IMAGES, uploadLimitBytes, uploadLimitMb, type ChatAttachment } from '@/lib/utils/media';
import { VerifiedBadge, MiniProfilePopup, EmojiPicker, EmojiInput, type EmojiInputHandle, GifPicker, UserContextMenu, ModeratorBadge, PremiumBadge, BotBadge, ChatGif, ChatAlbum, ChatMedia, AttachMenu, renderEmojiNodes, MessageText, LinkPreview, FormattingHelp, useSlashCommands }  from '@/components/ui';
import { ReactionBar, type ReactionGroup } from '@/components/ui/reaction-bar';
import { createClient }   from '@/lib/supabase/client';
import { resolveEmojiShortcodes } from '@/lib/emoji';
import { useT }           from '@/providers/i18n-provider';
import { useImageViewer, useChatAttachments, AttachmentTray, uploadDirect, type PendingFile } from '@/features/media';
import { PopoutButton }   from '@/components/shell/popout-button';
import { useCall, CallUI } from '@/features/calls';
import { AvatarWithStatus, effectiveStatus, lastSeenLabel, usePresence } from '@/features/presence';
import { DeviceBadge } from '@/features/presence';
import { hideConversation, togglePinConversation, toggleMuteConversation, sendDmViaServer } from './actions';
import { unblockUser } from '@/features/social';
import { CreateGroupModal, GroupContextMenu } from '@/features/groups';
import { useRateLimit, RateLimitPopup } from '@/lib/rate-limit';
import { getDraft, setDraft, clearDraft } from '@/lib/utils/drafts';
import { StickerPicker, Sticker, stickerContent, stickerOf } from '@/features/stickers';
import { ServerInviteEmbed, inviteTokenOf } from '@/features/servers';
import { setTabMeta } from '@/features/tabs';
import { triggerPushForMessage } from '@/features/notifications';
import { readCachedMessages, writeCachedMessages } from '@/lib/messages/cache';

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender: { username: string; display_name: string | null; avatar_url: string | null; is_verified?: boolean; is_moderator?: boolean; is_premium?: boolean; is_bot?: boolean } | null;
  pending?: boolean;
  failed?: boolean;
  failedReason?: string;
  type?: 'text' | 'call' | 'system';
  call_seconds?: number | null;
  reply_to?: string | null;
  /** Local blob previews shown instantly while attachments upload (Discord-style). */
  attachments?: ChatAttachment[];
  uploading?: boolean;
  /** Set once the message was edited — drives the "(edited)" marker. */
  edited_at?: string | null;
  /** Set when pinned (either participant can pin in a DM, Telegram-style). */
  pinned_at?: string | null;
}

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
}

interface OtherUser {
  id?: string;
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
}

interface GroupMember {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
  is_bot?: boolean;
  status?: string | null;
  last_seen?: string | null;
  is_owner?: boolean;
}

interface GroupInfo {
  conversationId: string;
  publicId: string;
  name: string | null;
  avatar: string | null;
  memberCount: number;
}

interface ChatWindowProps {
  conversationId: string;
  initialMessages: Message[];
  myProfileId: string;
  myProfile: Profile | null;
  otherUser: OtherUser | null;
  group?: GroupInfo | null;
  members?: GroupMember[];
  locale: string;
  placeholderLabel: string;
  initialOtherReadAt?: string | null;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground/60 inline-block" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground/60 inline-block" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground/60 inline-block" />
    </div>
  );
}

/** Localized text for a group system message code stored in `content`. */
function systemMessageText(content: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (content === 'group_create') return t('sysGroupCreate');
  if (content === 'group_avatar') return t('sysGroupAvatar');
  if (content === 'pinned') return t('sysPinned');
  if (content === 'friends') return t('sysFriends');
  if (content.startsWith('group_rename:')) return t('sysGroupRename', { name: content.slice('group_rename:'.length) });
  if (content.startsWith('group_add:'))    return t('sysGroupAdd', { name: content.slice('group_add:'.length) });
  if (content.startsWith('group_leave:'))  return t('sysGroupLeave');
  if (content.startsWith('group_kick:'))   return t('sysGroupKick', { name: content.slice('group_kick:'.length) });
  return content;
}

/** Icon + color for a group system message. */
function systemMessageIcon(content: string): { Icon: typeof Users; cls: string } {
  if (content === 'group_create')          return { Icon: Users,      cls: 'text-link' };
  if (content === 'friends')               return { Icon: UserPlus,    cls: 'text-success' };
  if (content === 'pinned')                return { Icon: Pin,        cls: 'text-link' };
  if (content === 'group_avatar')          return { Icon: ImageIcon,  cls: 'text-link' };
  if (content.startsWith('group_rename:')) return { Icon: Pencil,     cls: 'text-link' };
  if (content.startsWith('group_add:'))    return { Icon: UserPlus,   cls: 'text-success' };
  if (content.startsWith('group_leave:'))  return { Icon: LogOut,     cls: 'text-muted-foreground' };
  if (content.startsWith('group_kick:'))   return { Icon: UserMinus,  cls: 'text-destructive' };
  return { Icon: Users, cls: 'text-muted-foreground' };
}

export function ChatWindow({
  conversationId,
  initialMessages,
  myProfileId,
  myProfile,
  otherUser,
  group = null,
  members = [],
  locale,
  placeholderLabel,
  initialOtherReadAt = null,
}: ChatWindowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [messages,  setMessages]  = useState<Message[]>(initialMessages);

  /* ── Local-first cache (Telegram-style instant open) ──
     On entering a conversation, paint the last-seen messages from IndexedDB
     IMMEDIATELY — before the network refetch below lands — so a re-opened chat
     never shows a gap/skeleton. Only fills when we don't already have a fuller
     list from SSR (initialMessages). The refetch() effect further down is the
     source of truth and overwrites both state and cache. */
  useEffect(() => {
    let active = true;
    if (initialMessages.length > 0) return; // SSR already gave us the thread
    readCachedMessages<Message>(conversationId).then((cached) => {
      if (!active || !cached?.length) return;
      setMessages((prev) => {
        if (prev.length > 0) return prev; // network/SSR already populated — keep it
        return cached;
      });
    });
    return () => { active = false; };
  }, [conversationId, initialMessages.length]);

  /* Keep the local-first cache fresh as messages change live (realtime
     inserts/edits/deletes, sends) — debounced so we don't hammer IndexedDB on
     every keystroke-driven re-render. Only persists confirmed rows (drops
     still-optimistic opt- bubbles) so a reload never restores a ghost message. */
  useEffect(() => {
    const id = setTimeout(() => {
      const confirmed = messages.filter((m) => !(typeof m.id === 'string' && m.id.startsWith('opt-')));
      if (confirmed.length > 0) void writeCachedMessages(conversationId, confirmed);
    }, 600);
    return () => clearTimeout(id);
  }, [messages, conversationId]);

  // Keep this conversation's browser tab labelled with its name + avatar.
  useEffect(() => {
    const m = pathname.match(/^\/messages\/([^/]+)/);
    if (!m) return;
    const title = group?.name?.trim() || otherUser?.display_name?.trim() || otherUser?.username || '';
    const icon = group?.avatar ?? otherUser?.avatar_url ?? null;
    setTabMeta(`dm:${m[1]}`, { title, icon });
  }, [pathname, group?.name, group?.avatar, otherUser?.display_name, otherUser?.username, otherUser?.avatar_url]);
  const [isTyping,  setIsTyping]  = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [favGifs,   setFavGifs]   = useState<Set<string>>(new Set());
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupInviteOpen, setGroupInviteOpen] = useState(false);
  const [replyTo,   setReplyTo]   = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [otherPresence, setOtherPresence] = useState<{ status?: string | null; last_seen?: string | null }>({
    status: otherUser?.status, last_seen: otherUser?.last_seen,
  });
  const [convPinned, setConvPinned] = useState(false);
  const [convMuted,  setConvMuted]  = useState(false);
  const [iBlockedThem, setIBlockedThem] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [relTargetId, setRelTargetId] = useState<string | null>(null);
  // Read receipts (DM only): the other participant's last_read_at.
  const [otherReadAt, setOtherReadAt] = useState<string | null>(initialOtherReadAt);
  // Live character count for the composer (counter appears near the limit).
  const [charCount, setCharCount] = useState(0);
  // @-mention autocomplete (everyone / here / members).
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [reactions, setReactions] = useState<Map<string, ReactionGroup[]>>(new Map());

  const { acquire: acquireSend, blockedFor, clearBlock } = useRateLimit('message');

  const tm = useT('messages');
  const tc = useT('calls');
  const ts = useT('status');

  // Map a raw RPC/network error to a localized, human message for the failed
  // bubble — instead of leaking codes like "not_allowed" to the user.
  const friendlyError = (raw: unknown): string => {
    const s = String((raw as { message?: string })?.message ?? raw ?? '');
    if (s.includes('not_allowed')) return tm('sendNotAllowed');
    if (s.includes('blocked'))     return tm('sendBlocked');
    if (/fetch|network|load failed|connection/i.test(s)) return tm('sendFailed');
    return tm('sendFailed');
  };
  const imageViewer = useImageViewer();
  const att = useChatAttachments(uploadLimitBytes(myProfile?.is_premium));
  // Super Prosto raises the per-message character limit.
  const msgLimit = myProfile?.is_premium ? 4000 : 2000;
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  // ── Mobile back-swipe is handled by the app shell drawer ──

  const scrollRef     = useRef<HTMLDivElement>(null);
  const textRef       = useRef<EmojiInputHandle>(null);
  const slash = useSlashCommands({
    scope: 'dm',
    conversationId,
    textRef,
    setCharCount,
    labels: {
      title: tm('slashCommands'),
      empty: tm('slashNoCommands'),
      failed: tm('slashFailed'),
      missing: (n) => tm('slashMissing', { name: n }),
      botCannotSend: tm('slashBotCannotSend'),
      botUnavailable: tm('slashBotUnavailable'),
      rateLimited: tm('slashRateLimited'),
    },
  });
  const typingTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingRef = useRef(0);
  const sbRef         = useRef(createClient());

  /* ── Realtime: new messages ── */
  useEffect(() => {
    const sb = sbRef.current;

    const msgChannel = sb
      .channel(`dm:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const raw = payload.new as any;
        setMessages(prev => {
          // Already have this exact row (e.g. our own optimistic send already
          // reconciled to its real id) → nothing to do.
          if (prev.some(m => m.id === raw.id)) return prev;

          // Cross-device: a message I sent from ANOTHER device (phone) arrives
          // here with my own sender_id but has NO optimistic bubble on this
          // client. If there's a matching pending optimistic message (same
          // author + content, still opt-...), reconcile it to the real row so
          // there's no duplicate; otherwise append it fresh. This is what makes
          // web ⇄ phone stay in sync live (the old code dropped all own-sender
          // events, so a phone-sent message never appeared on web until reload).
          if (raw.sender_id === myProfileId && raw.type !== 'system') {
            const optIdx = prev.findIndex(
              m => m.id.startsWith('opt-') && m.sender_id === myProfileId && m.content === raw.content,
            );
            if (optIdx !== -1) {
              const next = [...prev];
              next[optIdx] = { ...next[optIdx]!, id: raw.id, created_at: raw.created_at, pending: false, failed: false };
              return next;
            }
          }

          return [...prev, {
            id: raw.id,
            content: raw.content,
            created_at: raw.created_at,
            sender_id: raw.sender_id,
            type: raw.type ?? 'text',
            call_seconds: raw.call_seconds ?? null,
            reply_to: raw.reply_to ?? null,
            sender: raw.sender_id === myProfileId
              ? { username: myProfile?.username ?? '', display_name: myProfile?.display_name ?? null, avatar_url: myProfile?.avatar_url ?? null, is_verified: myProfile?.is_verified, is_moderator: myProfile?.is_moderator, is_premium: myProfile?.is_premium }
              : group
              ? (members.find(mm => mm.id === raw.sender_id) ?? null)
              : (otherUser
                ? { username: otherUser.username, display_name: otherUser.display_name, avatar_url: otherUser.avatar_url, is_verified: otherUser.is_verified, is_moderator: otherUser.is_moderator, is_premium: otherUser.is_premium, is_bot: otherUser.is_bot }
                : null),
          }];
        });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const oldId = (payload.old as any)?.id;
        if (oldId) setMessages(prev => prev.filter(m => m.id !== oldId));
      })
      // Edit / pin arrive as UPDATEs — apply live to that message.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const raw = payload.new as any;
        setMessages(prev => prev.map(m => (m.id === raw.id
          ? { ...m, content: raw.content, edited_at: raw.edited_at ?? null, pinned_at: raw.pinned_at ?? null }
          : m)));
      })
      .subscribe();

    return () => {
      sb.removeChannel(msgChannel);
    };
  }, [conversationId, myProfileId]);

  /* ── Merge freshly-fetched server messages (e.g. after router.refresh from a
       group rename/avatar/add/kick) so system events appear without a remount. ── */
  useEffect(() => {
    if (initialMessages.length === 0) return;
    setMessages(prev => {
      const ids = new Set(prev.map(m => m.id));
      const added = initialMessages.filter(m => !ids.has(m.id));
      if (added.length === 0) return prev;
      const merged = [...prev, ...added];
      merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return merged;
    });
  }, [initialMessages]);

  /* ── Directly refetch messages after a group action (rename/avatar/add/kick),
       independent of realtime/prop propagation. ── */
  useEffect(() => {
    async function refetch() {
      const sb = sbRef.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: any[] | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb as any).rpc('get_conversation_messages', { conv: conversationId });
      if (!error && Array.isArray(data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows = data.map((m: any) => ({
          id: m.id, content: m.content, created_at: m.created_at, sender_id: m.sender_id,
          type: m.type ?? 'text', call_seconds: m.call_seconds ?? null, reply_to: m.reply_to ?? null,
          edited_at: m.edited_at ?? null, pinned_at: m.pinned_at ?? null,
          sender: { username: m.sender_username, display_name: m.sender_display_name, avatar_url: m.sender_avatar_url, is_verified: m.sender_is_verified, is_moderator: m.sender_is_moderator, is_premium: m.sender_is_premium, is_bot: m.sender_is_bot },
        }));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: raw } = await (sb as any)
          .from('direct_messages')
          .select(`id, content, created_at, sender_id, type, call_seconds, reply_to,
            sender:profiles!direct_messages_sender_id_fkey(username, display_name, avatar_url, is_verified, is_moderator, is_premium)`)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(200);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows = (raw ?? []).map((m: any) => ({
          id: m.id, content: m.content, created_at: m.created_at, sender_id: m.sender_id,
          type: m.type ?? 'text', call_seconds: m.call_seconds ?? null, reply_to: m.reply_to ?? null,
          sender: Array.isArray(m.sender) ? m.sender[0] : m.sender,
        })).reverse();
      }
      if (!rows) return;
      const fetched = rows;
      // Replace with the DB truth (authoritative). Navigating back to a chat
      // can otherwise show a stale client-cached list; this keeps it correct.
      // Preserve: (a) still-optimistic messages, and (b) messages sent in the
      // last few seconds that the authoritative list doesn't include yet — a
      // read replica / realtime lag right after send must not drop a real, just-
      // sent message from view.
      const RECENT_MS = 15_000;
      const now = Date.now();
      setMessages(prev => {
        const ids = new Set(fetched.map(m => m.id));
        const kept = prev.filter(m =>
          !ids.has(m.id) && (
            (typeof m.id === 'string' && m.id.startsWith('opt-')) ||
            (m.sender_id === myProfileId && now - new Date(m.created_at).getTime() < RECENT_MS)
          ),
        );
        return [...fetched, ...kept].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
      // Persist the authoritative list for an instant next-open (local-first).
      void writeCachedMessages(conversationId, fetched);
    }
    // Authoritative load on entering the conversation (fixes stale router cache).
    refetch();
    function onUpdated(e: Event) {
      const d = (e as CustomEvent).detail as { conversationId?: string } | undefined;
      if (d?.conversationId && d.conversationId !== conversationId) return;
      refetch();
    }
    window.addEventListener('prosto:conv-updated', onUpdated as EventListener);
    return () => window.removeEventListener('prosto:conv-updated', onUpdated as EventListener);
  }, [conversationId]);

  /* ── Typing: receive via the always-mounted DM list (window event) to avoid
       subscribing twice to the same realtime topic on one client. ── */
  useEffect(() => {
    function onTyping(e: Event) {
      const d = (e as CustomEvent).detail as { conversationId?: string; from?: string; name?: string; typing?: boolean } | undefined;
      if (!d || d.conversationId !== conversationId || d.from === myProfileId) return;
      if (d.typing) {
        if (group) {
          const mem = members.find(mm => mm.id === d.from);
          setTypingName(d.name || mem?.display_name || mem?.username || null);
        }
        setIsTyping(true);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        typingClearRef.current = setTimeout(() => setIsTyping(false), 5000);
      } else {
        setIsTyping(false);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
      }
    }
    window.addEventListener('prosto:typing', onTyping as EventListener);
    return () => {
      window.removeEventListener('prosto:typing', onTyping as EventListener);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
    };
  }, [conversationId, myProfileId]);

  /* ── Send typing — delegated to the DM list, which owns the typing channel. ── */
  function sendTyping(typing: boolean) {
    const myDisplayName = myProfile?.display_name ?? myProfile?.username ?? '';
    window.dispatchEvent(new CustomEvent('prosto:send-typing', {
      detail: { conversationId, from: myProfileId, name: myDisplayName, typing },
    }));
  }

  /* ── Live presence for the header (realtime, seeded from SSR) ── */
  const livePresence = usePresence(otherUser?.id, otherUser?.status, otherUser?.last_seen);
  useEffect(() => {
    if (livePresence.status !== undefined || livePresence.last_seen !== undefined) {
      setOtherPresence({ status: livePresence.status, last_seen: livePresence.last_seen });
    }
  }, [livePresence.status, livePresence.last_seen]);

  /* Mark this conversation read (persisted) — reliably.
     Fires IMMEDIATELY on open and on every new message while viewing, plus once
     more in the cleanup when leaving the chat. The old 500ms timer was cancelled
     on fast navigation, so last_read_at never advanced past the last seen
     message and the "unread" badge came back after switching tabs. A broadcast
     also tells the always-mounted badge hooks to clear this conversation now,
     without waiting for their poll. */
  /* Read state + live receipt over a shared broadcast channel.
     RLS on conversation_participants only exposes a client's OWN row, so a
     postgres_changes subscription can NEVER see the other person's last_read_at
     — that's why the ✓✓ used to need a reload. Instead, whoever reads BROADCASTS
     a `read` event on the conversation's channel; the other side (subscribed to
     the same channel) updates the receipt instantly. Works around RLS and needs
     no polling.

     This effect owns marking read (immediately on open, on each new message,
     and on leave) AND broadcasting it, plus receiving the peer's reads. */
  useEffect(() => {
    if (!conversationId) return;
    const sb = sbRef.current;
    let active = true;

    const receiptCh = sb.channel(`dm-receipt:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    receiptCh
      .on('broadcast', { event: 'read' }, ({ payload }) => {
        const p = payload as { from?: string; at?: string } | undefined;
        if (!p || !p.at || p.from === myProfileId) return; // only the peer's read
        setOtherReadAt((prev) =>
          !prev || new Date(p.at as string).getTime() > new Date(prev).getTime() ? (p.at as string) : prev,
        );
      })
      .subscribe();

    const markRead = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('mark_conversation_read', { conv_id: conversationId }).then(({ data }: any) => {
        // Tell the peer their message was read → live ✓✓ (no reload).
        // Use httpSend (explicit REST): this effect re-runs on every new message,
        // so the send often lands on a channel that isn't WebSocket-joined yet
        // (or is being torn down in cleanup). send() would implicitly fall back
        // to REST and log a deprecation warning on every message — httpSend is
        // the explicit, warning-free REST path for a fire-and-forget receipt.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (receiptCh as any).httpSend('read', {
          from: myProfileId, at: (data as string) ?? new Date().toISOString(),
        }).catch(() => {});
      });
      // Clear this conversation's own unread badges immediately (same tab).
      window.dispatchEvent(new CustomEvent('prosto:conv-read', { detail: { conversationId } }));
    };
    markRead();

    // Seed the initial receipt (in case the peer read before I opened).
    if (!group) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('get_dm_read_at', { conv: conversationId }).then(({ data }: any) => {
        if (active && data) setOtherReadAt(data as string);
      });
    }

    return () => { active = false; markRead(); sb.removeChannel(receiptCh); };
  }, [conversationId, group, myProfileId, messages.length]);

  // Restore a saved draft for this conversation; persist the latest on unmount.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const d = getDraft('dm', conversationId);
    if (d) {
      el.value = d;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
      setCharCount(d.length);
    }
    return () => { setDraft('dm', conversationId, textRef.current?.value ?? ''); };
  }, [conversationId]);

  /* ── Discord-style composer shortcuts ──
     • Start typing anywhere (no click needed) → focus the composer and let the
       character land in it. Ignored while another field/modal has focus or a
       modifier (Ctrl/Meta/Alt) is held.
     • ↑ on an empty composer → edit my last message.
     • Esc → close the reply preview / attachment editor first. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = textRef.current;
      if (!el) return;
      const active = document.activeElement as HTMLElement | null;
      const inField = !!active && (active.isContentEditable
        || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

      // Esc clears the reply target (composer already handles its own edit Esc).
      if (e.key === 'Escape' && !inField && replyTo) { setReplyTo(null); return; }

      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;

      // ↑ on an empty composer → edit my last text message (inline editor).
      if (e.key === 'ArrowUp' && !el.value.trim() && !editingId) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m && m.sender_id === myProfileId && !m.pending && !m.failed && m.type !== 'call' && m.type !== 'system' && !attachmentsOf(m.content)) {
            e.preventDefault();
            startEdit(m);
            return;
          }
        }
        return;
      }

      // A single printable character (no modifiers) → focus + type into composer.
      if (e.key.length === 1 && !e.repeat) {
        el.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, myProfileId, replyTo, editingId]);

  function handleInput() {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    setCharCount(el.value.length);
    setDraft('dm', conversationId, el.value);
    slash.detect(el);
    if (!slash.active) detectMention(el);
    // Re-broadcast "typing" at most every 2s while actively typing.
    const now = Date.now();
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      sendTyping(true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { lastTypingRef.current = 0; sendTyping(false); }, 2500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Slash command? Fire the bot interaction instead of sending a message.
    if (await slash.maybeSubmit()) return;
    const content = resolveEmojiShortcodes(textRef.current?.value.trim() ?? '');
    if (!content && att.count === 0) return;

    // Anti-spam gate: block (popup) or delay before sending.
    const gate = acquireSend();
    if (!gate.ok) return;

    const replyId = replyTo && !replyTo.id.startsWith('opt-') ? replyTo.id : null;
    const pending = att.take();

    sendTyping(false);
    lastTypingRef.current = 0;
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (textRef.current) { textRef.current.value = ''; textRef.current.style.height = 'auto'; }
    setCharCount(0);
    clearDraft('dm', conversationId);

    // Caption first (its own message), then the images as one album message —
    // shown instantly with local previews and uploaded in the background.
    if (content) await sendContent(content, gate.waitMs);
    if (pending.length) {
      if (!content) setReplyTo(null);
      void sendAttachments(pending, content ? null : replyId);
    }
  }

  async function sendContent(content: string, waitMs = 0) {
    // A reply target that is still optimistic (opt-...) isn't a real UUID yet —
    // sending it would make send_dm fail the uuid cast. Drop it in that case.
    const rawReplyId = replyTo?.id ?? null;
    const replyId = rawReplyId && rawReplyId.startsWith('opt-') ? null : rawReplyId;

    // Optimistic message — shown immediately, greyed out until confirmed
    const tempId = `opt-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      content,
      created_at: new Date().toISOString(),
      sender_id: myProfileId,
      sender: {
        username:     myProfile?.username ?? '',
        display_name: myProfile?.display_name ?? null,
        avatar_url:   myProfile?.avatar_url ?? null,
        is_verified:  myProfile?.is_verified,
        is_moderator: myProfile?.is_moderator,
      },
      pending: true,
      reply_to: replyId,
    };
    setMessages(prev => [...prev, optimistic]);
    setReplyTo(null);

    // Smooth out bursts: escalating client-side delay before the round-trip.
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    // Direct browser → Supabase RPC (single round-trip, no Next.js server hop)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data, error } = await (sbRef.current as any).rpc('send_dm', {
      conv_id: conversationId,
      body:    content,
      reply:   replyId,
    });

    // Fallback: if the direct call couldn't reach Supabase (e.g. the desktop
    // shell on a machine that blocks the client→Supabase request — "Failed to
    // fetch"), retry through the server, which reaches Supabase fine.
    if (error && /fetch|network|load failed|connection/i.test(String(error?.message ?? ''))) {
      const res = await sendDmViaServer(conversationId, content, replyId);
      if (!res.error) {
        data = { id: res.id, created_at: res.created_at };
        error = null;
      } else {
        error = { message: res.error };
      }
    }

    setMessages(prev => prev.map(m => {
      if (m.id !== tempId) return m;
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[send_dm]', error?.message || error?.code || error?.details || error);
        }
        const msg = typeof error?.message === 'string' ? error.message : '';
        if (msg.includes('blocked')) setTheyBlockedMe(true);
        // Localized, human reason (no raw codes like "not_allowed" leaking to UI).
        return { ...m, pending: false, failed: true, failedReason: friendlyError(error) };
      }
      const row = Array.isArray(data) ? data[0] : data;
      return {
        ...m,
        id:         row?.id ?? m.id,
        created_at: row?.created_at ?? m.created_at,
        pending:    false,
      };
    }));

    // Background push to the other participant(s) — arrives even when their app
    // is closed. Server skips the sender / DnD / muted.
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) triggerPushForMessage('dm', row.id as string);
    }
  }

  function sendGif(url: string) {
    if (!url) return;
    const gate = acquireSend();
    if (!gate.ok) return;
    sendContent(url, gate.waitMs);
  }

  function dragHasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
  }
  function onDragEnter(e: React.DragEvent) {
    if (!dragHasFiles(e)) return;
    dragDepth.current += 1;
    setDragOver(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (dragHasFiles(e)) e.preventDefault();
  }
  function onDragLeave() {
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) { dragDepth.current = 0; setDragOver(false); }
  }
  function onDrop(e: React.DragEvent) {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    att.addFiles(e.dataTransfer.files);
    textRef.current?.focus();
  }

  async function sendAttachments(pending: PendingFile[], replyId: string | null) {
    const tempId = `opt-${Date.now()}-att`;
    const previews: ChatAttachment[] = pending.map((p) => ({ url: p.previewUrl, kind: p.kind, name: p.name ?? p.file.name, size: p.file.size, progress: 0, ...(p.spoiler ? { spoiler: true } : {}) }));
    setMessages((prev) => [...prev, {
      id: tempId,
      content: '',
      created_at: new Date().toISOString(),
      sender_id: myProfileId,
      sender: {
        username:     myProfile?.username ?? '',
        display_name: myProfile?.display_name ?? null,
        avatar_url:   myProfile?.avatar_url ?? null,
        is_verified:  myProfile?.is_verified,
        is_moderator: myProfile?.is_moderator,
      },
      pending: true,
      uploading: true,
      attachments: previews,
      reply_to: replyId,
    }]);

    // Live per-file upload progress → the optimistic message's attachment card.
    const setAttProgress = (index: number, percent: number) => {
      setMessages((prev) => prev.map((m) => (m.id === tempId
        ? { ...m, attachments: m.attachments?.map((a, ai) => (ai === index ? { ...a, progress: percent } : a)) }
        : m)));
    };

    // Upload all files in parallel to object storage with per-file progress.
    // Spoiler / rename flags ride as query params on the stored URL (chat has
    // no structured attachment column) and are decoded again by attachmentsOf.
    const results = await Promise.all(
      pending.map((p, i) =>
        uploadDirect(p.file, {
          onProgress: ({ percent }) => setAttProgress(i, percent),
        }).then((r) => (r.url ? withAttachmentMeta(r.url, { spoiler: p.spoiler, name: p.name }) : null)),
      ),
    );
    const urls = results.filter((u): u is string => !!u);

    if (urls.length === 0) {
      setMessages((prev) => prev.map((m) => (m.id === tempId
        ? { ...m, uploading: false, pending: false, failed: true, failedReason: 'upload failed' }
        : m)));
      return;
    }

    const body = urls.join('\n');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data, error } = await (sbRef.current as any).rpc('send_dm', { conv_id: conversationId, body, reply: replyId });
    if (error && /fetch|network|load failed|connection/i.test(String(error?.message ?? ''))) {
      const res = await sendDmViaServer(conversationId, body, replyId);
      if (!res.error) { data = { id: res.id, created_at: res.created_at }; error = null; }
      else error = { message: res.error };
    }
    setMessages((prev) => prev.map((m) => {
      if (m.id !== tempId) return m;
      if (error) return { ...m, uploading: false, pending: false, failed: true, failedReason: friendlyError(error) };
      const row = Array.isArray(data) ? data[0] : data;
      return { ...m, id: row?.id ?? m.id, created_at: row?.created_at ?? m.created_at, content: body, attachments: undefined, uploading: false, pending: false };
    }));
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) triggerPushForMessage('dm', row.id as string);
    }
  }

  function sendSticker(id: string) {
    if (!id) return;
    const gate = acquireSend();
    if (!gate.ok) return;
    sendContent(stickerContent(id), gate.waitMs);
  }

  /* ── GIF favorites (URLs only) for the hover-star on chat images ── */
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).from('gif_favorites').select('url').then(({ data }: any) => {
      if (active && data) setFavGifs(new Set(data.map((r: any) => r.url)));
    });
    return () => { active = false; };
  }, []);

  /* ── Load + realtime reactions for this conversation ── */
  useEffect(() => {
    const ids = messages.filter((m) => !m.id.startsWith('opt-') && m.type !== 'call' && m.type !== 'system').map((m) => m.id);
    if (ids.length === 0) return;
    const sb = sbRef.current;
    let active = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any).rpc('get_message_reactions', { p_messages: ids, p_source: 'dm' }).then(({ data }: any) => {
      if (!active || !Array.isArray(data)) return;
      const map = new Map<string, ReactionGroup[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of data as any[]) {
        const key = r.message_id as string;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ emoji: r.emoji, count: Number(r.reaction_count), reacted: !!r.reacted });
      }
      setReactions(map);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reactionCh = (sb as any)
      .channel(`dm-reactions:${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `source=eq.dm` }, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any).rpc('get_message_reactions', { p_messages: ids, p_source: 'dm' }).then(({ data }: any) => {
          if (!Array.isArray(data)) return;
          const map = new Map<string, ReactionGroup[]>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const r of data as any[]) {
            const key = r.message_id as string;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push({ emoji: r.emoji, count: Number(r.reaction_count), reacted: !!r.reacted });
          }
          setReactions(map);
        });
      })
      .subscribe();

    return () => { active = false; sb.removeChannel(reactionCh); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, conversationId]);

  async function toggleFavGif(url: string) {
    const sb = sbRef.current;
    if (favGifs.has(url)) {
      setFavGifs(prev => { const n = new Set(prev); n.delete(url); return n; });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('gif_favorites').delete().eq('url', url);
    } else {
      setFavGifs(prev => new Set(prev).add(url));
      const { data: { user } } = await sb.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (user) await (sb as any).from('gif_favorites').insert({ user_id: user.id, url, preview: url });
    }
  }

  /* ── Message actions ── */
  function insertEmoji(emoji: string) {
    // Custom emojis arrive as `<a?:name:id>` tokens and become inline chips;
    // unicode emoji insert as their glyph. onInput → handleInput updates the
    // draft, char count and auto-resize.
    textRef.current?.insertAtCaret(emoji);
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function startReply(m: Message) {
    setReplyTo(m);
    textRef.current?.focus();
  }

  async function deleteMessage(id: string) {
    setMessages(prev => prev.filter(m => m.id !== id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).from('direct_messages').delete().eq('id', id);
  }

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditValue(m.content);
  }
  async function saveEdit(id: string) {
    const value = editValue.trim();
    setEditingId(null);
    if (!value) return;
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: value, edited_at: new Date().toISOString() } : m)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).rpc('edit_dm', { p_message: id, p_body: value });
  }

  async function togglePin(m: Message) {
    const pinning = !m.pinned_at;
    // Optimistic — the realtime UPDATE will confirm it for both participants.
    setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, pinned_at: pinning ? new Date().toISOString() : null } : x)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).rpc('pin_dm', { p_message: m.id, p_pin: pinning });
  }

  async function toggleDmReaction(messageId: string, emoji: string) {
    // Optimistic update
    setReactions((prev) => {
      const next = new Map(prev);
      const list = next.get(messageId) ?? [];
      const existing = list.find((r) => r.emoji === emoji);
      if (existing) {
        const updated = list
          .map((r) => r.emoji === emoji ? { ...r, count: r.reacted ? r.count - 1 : r.count + 1, reacted: !r.reacted } : r)
          .filter((r) => r.count > 0);
        next.set(messageId, updated);
      } else {
        next.set(messageId, [...list, { emoji, count: 1, reacted: true }]);
      }
      return next;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).rpc('toggle_message_reaction', { p_message: messageId, p_source: 'dm', p_emoji: emoji });
  }

  function forwardMessage(m: Message) {
    // Simple forward: prefill input with quoted content
    const el = textRef.current;
    if (!el) return;
    el.value = `${m.content}`;
    el.focus();
    setCharCount(el.value.length);
    setReplyTo(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (slash.onKeyDown(e)) return;
    if (mention && mentionItems.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionItems.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionItems.length) % mentionItems.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mentionItems[mentionIdx] ?? mentionItems[0]!); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }
  }

  /* ── @-mention autocomplete ── */
  function detectMention(el: EmojiInputHandle) {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const m = before.match(/(?:^|\s)@([a-z0-9_]*)$/i);
    if (m) {
      setMention({ query: m[1] ?? '', start: caret - (m[1]?.length ?? 0) - 1 });
      setMentionIdx(0);
    } else if (mention) {
      setMention(null);
    }
  }

  function applyMention(item: { insert: string }) {
    const el = textRef.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? el.value.length;
    const insertText = `@${item.insert} `;
    el.value = el.value.slice(0, mention.start) + insertText + el.value.slice(caret);
    const pos = mention.start + insertText.length;
    el.setSelectionRange(pos, pos);
    el.focus();
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    setCharCount(el.value.length);
    setMention(null);
  }

  /* ── Load my pin/mute settings for this conversation ── */
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any)
      .from('conversation_participants')
      .select('pinned, muted')
      .eq('conversation_id', conversationId)
      .eq('profile_id', myProfileId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (active && data) { setConvPinned(!!data.pinned); setConvMuted(!!data.muted); }
      });
    return () => { active = false; };
  }, [conversationId, myProfileId]);

  function handleTogglePin() {
    const next = !convPinned;
    setConvPinned(next);
    togglePinConversation(conversationId, next);
  }
  function handleToggleMute() {
    const next = !convMuted;
    setConvMuted(next);
    toggleMuteConversation(conversationId, next);
  }
  function handleCloseDm() {
    hideConversation(conversationId).then(() => router.push('/messages'));
  }

  /* ── Block relationship — fetched on mount + polled (covers both directions) ── */
  useEffect(() => {
    if (!otherUser) return;
    let active = true;
    const sb = sbRef.current;
    const fetchBlock = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).rpc('get_user_relationship', { target_username: otherUser.username });
      if (active && data?.[0]) {
        setIBlockedThem(!!data[0].is_blocked);
        setTheyBlockedMe(!!data[0].blocked_by);
        setRelTargetId(data[0].target_id);
      }
    };
    fetchBlock();
    const id = setInterval(fetchBlock, 30000);
    const onFocus = () => fetchBlock();
    const onRel = () => fetchBlock();
    window.addEventListener('focus', onFocus);
    window.addEventListener('prosto:relationship', onRel);
    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('prosto:relationship', onRel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, myProfileId]);

  async function handleUnblock() {
    if (!otherUser || !relTargetId) return;
    setIBlockedThem(false);
    const fd = new FormData();
    fd.append('target_id', relTargetId);
    fd.append('username', otherUser.username);
    await unblockUser(fd);
  }

  const otherName    = otherUser?.display_name ?? otherUser?.username ?? '?';
  const otherInitial = otherName[0]?.toUpperCase() ?? '?';
  const myName       = myProfile?.display_name ?? myProfile?.username ?? tm('you');

  // Pinned messages (newest pin first) — drives the Telegram-style top bar.
  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.pinned_at)
      .sort((a, b) => new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime()),
    [messages],
  );

  // Telegram-style: the bar shows the pin nearest ABOVE the viewport top. As you
  // scroll up past an older pin, the bar switches to it. Pins in chat order
  // (oldest→newest by position) so we can pick the last one above the fold.
  const pinnedByPosition = useMemo(
    () => messages.filter((m) => m.pinned_at),
    [messages],
  );
  const [activePinId, setActivePinId] = useState<string | null>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || pinnedByPosition.length === 0) return;
    const onScroll = () => {
      const top = scroller.getBoundingClientRect().top;
      // The pin whose message sits just above the top edge is the "current" one.
      let current: string | null = null;
      for (const p of pinnedByPosition) {
        const el = scroller.querySelector(`[data-mid="${p.id}"]`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= top + 56) current = p.id;
      }
      // Above the oldest pin → show the newest (default resting state).
      setActivePinId(current ?? pinnedByPosition[pinnedByPosition.length - 1]?.id ?? null);
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [pinnedByPosition]);

  // Which pin the bar currently represents (falls back to newest).
  const barPin = pinnedMessages.find((p) => p.id === activePinId) ?? pinnedMessages[0] ?? null;

  // Scroll to a message + flash it (from the pinned bar).
  function jumpToMessage(id: string) {
    const el = document.querySelector(`[data-mid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('jump-highlight');
    setTimeout(() => el.classList.remove('jump-highlight'), 2400);
  }

  // DM read receipt: show only when my message is the latest in the chat —
  // once the other person replies after it, the mark disappears.
  const receiptMsg = (() => {
    if (group) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.type === 'system') continue;
      return (m.sender_id === myProfileId && !m.pending && !m.failed) ? m : null;
    }
    return null;
  })();
  const myLastMsgId = receiptMsg?.id ?? null;
  const myLastReadByOther =
    !!receiptMsg && !!otherReadAt &&
    new Date(receiptMsg.created_at).getTime() <= new Date(otherReadAt).getTime();

  // @-mention suggestions for the composer.
  const mentionItems = useMemo(() => {
    type Item = { id: string; insert: string; label: string; sub: string; avatar?: string | null; special?: boolean };
    if (!mention) return [] as Item[];
    const q = mention.query.toLowerCase();
    const out: Item[] = [];
    if (group) {
      if ('everyone'.startsWith(q)) out.push({ id: 'everyone', insert: 'everyone', label: '@everyone', sub: tm('mentionEveryone'), special: true });
      if ('here'.startsWith(q)) out.push({ id: 'here', insert: 'here', label: '@here', sub: tm('mentionHere'), special: true });
      members.forEach((mm) => {
        if (mm.id === myProfileId) return;
        const dn = mm.display_name ?? mm.username;
        if (mm.username.toLowerCase().includes(q) || dn.toLowerCase().includes(q)) {
          out.push({ id: mm.id, insert: mm.username, label: dn, sub: `@${mm.username}`, avatar: mm.avatar_url });
        }
      });
    } else if (otherUser) {
      const dn = otherUser.display_name ?? otherUser.username;
      if (otherUser.username.toLowerCase().includes(q) || dn.toLowerCase().includes(q)) {
        out.push({ id: otherUser.username, insert: otherUser.username, label: dn, sub: `@${otherUser.username}`, avatar: otherUser.avatar_url });
      }
    }
    return out.slice(0, 8);
  }, [mention, group, members, otherUser, myProfileId, tm]);

  /* ── Audio call ── */
  const logCallMessage = async (kind: 'started' | 'ended', seconds: number | null) => {
    // Written via a SECURITY DEFINER RPC (not a direct insert) so direct_messages
    // stays locked down at the RLS layer — all writes go through guarded RPCs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (sbRef.current as any)
      .rpc('log_call_message', { conv_id: conversationId, kind, seconds });
    const data = Array.isArray(rows) ? rows[0] : rows;
    if (data) {
      setMessages(prev => [...prev, {
        id:           data.id,
        content:      kind,
        created_at:   data.created_at,
        sender_id:    myProfileId,
        type:         'call',
        call_seconds: seconds,
        sender: {
          username:     myProfile?.username ?? '',
          display_name: myProfile?.display_name ?? null,
          avatar_url:   myProfile?.avatar_url ?? null,
          is_verified:  myProfile?.is_verified,
          is_moderator: myProfile?.is_moderator,
        },
      }]);
    }
  };

  const call = useCall({
    supabase: sbRef.current,
    conversationId,
    myId: myProfileId,
    onCallStarted: () => { logCallMessage('started', null); },
    onCallEnded: ({ seconds, connected, byMe }) => {
      if (!byMe) return;
      logCallMessage('ended', connected ? seconds : -1);
    },
  });

  const meUser = {
    username:     myProfile?.username ?? '',
    display_name: myProfile?.display_name ?? null,
    avatar_url:   myProfile?.avatar_url ?? null,
    is_verified:  myProfile?.is_verified,
    is_moderator: myProfile?.is_moderator,
  };

  return (
    <div
      className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag-and-drop overlay */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-link px-10 py-8">
            <ImagePlus className="h-8 w-8 text-link" />
            <p className="text-[15px] font-semibold text-foreground">{tm('dropToAttach')}</p>
          </div>
        </div>
      )}

      {/* Hidden audio sink for the remote stream */}
      <audio ref={call.remoteAudioRef} autoPlay className="hidden" />

      {groupModalOpen && (
        <CreateGroupModal
          preselect={relTargetId ? [relTargetId] : []}
          onClose={() => setGroupModalOpen(false)}
        />
      )}

      {groupInviteOpen && group && (
        <CreateGroupModal addToGroup={group.conversationId} onClose={() => setGroupInviteOpen(false)} />
      )}

      {/* ── Header ── */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/20 bg-background/90 px-4 shadow-sm">
        {group ? (
          <>
            <button
              type="button"
              onClick={() => router.push('/messages')}
              aria-label={tm('back')}
              className="chat-back -ml-1 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <GroupContextMenu
              openOnClick
              group={{ conversationId: group.conversationId, publicId: group.publicId, name: group.name, avatar: group.avatar }}
            >
              <div className="flex min-w-0 cursor-pointer items-center gap-3">
                <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-link/25">
                  {group.avatar
                    ? <Image src={group.avatar} alt={group.name ?? ''} fill sizes="28px" className="object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-link"><Users className="h-4 w-4" /></span>}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold leading-tight hover:underline">{group.name?.trim() || tm('unnamedGroup')}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground/70">{members.length || group.memberCount} {tm('membersCount')}</span>
                </div>
              </div>
            </GroupContextMenu>
            <button
              type="button"
              onClick={() => setGroupInviteOpen(true)}
              title={tm('inviteToGroup')}
              className="widget-hide ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <UserPlus className="h-[18px] w-[18px]" />
            </button>
          </>
        ) : otherUser ? (
          <>
            <button
              type="button"
              onClick={() => router.push('/messages')}
              aria-label={tm('back')}
              className="chat-back -ml-1 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <UserContextMenu
              user={otherUser}
              conversationId={conversationId}
              pinned={convPinned}
              muted={convMuted}
              onCall={call.startCall}
              onCloseDm={handleCloseDm}
              onTogglePin={handleTogglePin}
              onToggleMute={handleToggleMute}
            >
              <AvatarWithStatus status={otherPresence.status} lastSeen={otherPresence.last_seen} size={28} dotSize={6}>
                {otherUser.avatar_url
                  ? <AvatarImage src={otherUser.avatar_url} alt={otherName} sizes="28px" className="object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{otherInitial}</span>}
              </AvatarWithStatus>
            </UserContextMenu>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5">
                <MiniProfilePopup user={otherUser}>
                  <span className={cn('text-[15px] font-semibold leading-tight hover:underline cursor-pointer', otherUser.is_premium && 'aurora-text aurora-text-glow')}>{renderEmojiNodes(otherName)}</span>
                </MiniProfilePopup>
                {otherUser.is_bot && <BotBadge size="sm" />}
                {otherUser.is_verified && <VerifiedBadge size="sm" />}
                {otherUser.is_moderator && <ModeratorBadge size="sm" />}
                {otherUser.is_premium && <PremiumBadge size="sm" />}
              </div>
              <span className="truncate text-[11px] leading-tight text-muted-foreground/70">
                {otherUser.custom_status?.trim()
                  ? renderEmojiNodes(otherUser.custom_status.trim())
                  : effectiveStatus(otherPresence.status, otherPresence.last_seen) === 'offline'
                    ? lastSeenLabel(otherPresence.last_seen, (k, v) => tm(k, v), locale)
                    : ts(effectiveStatus(otherPresence.status, otherPresence.last_seen))}
              </span>
            </div>

            {/* Call button */}
            <button
              type="button"
              onClick={call.startCall}
              disabled={call.state !== 'idle'}
              title={tc('audioCall')}
              className="widget-hide ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <Phone className="h-[18px] w-[18px]" />
            </button>

            {/* Create group with this user */}
            <button
              type="button"
              onClick={() => setGroupModalOpen(true)}
              title={tm('createGroup')}
              className="widget-hide flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <UserPlus className="h-[18px] w-[18px]" />
            </button>
            <PopoutButton className="rounded-md" />
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Hash className="h-5 w-5" />
            <span className="text-[15px] font-semibold">{tm('conversationTitle')}</span>
          </div>
        )}
      </div>

      {/* ── Call panel — unified for incoming / calling / connected ── */}
      {call.state !== 'idle' && (
        <CallUI
          state={call.state}
          otherUser={otherUser}
          me={meUser}
          muted={call.muted}
          deafened={call.deafened}
          remoteMuted={call.remoteMuted}
          remoteDeafened={call.remoteDeafened}
          remotePresent={call.remotePresent}
          localLevel={call.localLevel}
          remoteLevel={call.remoteLevel}
          callSeconds={call.callSeconds}
          latency={call.latency}
          onAccept={call.acceptCall}
          onEnd={call.endCall}
          onToggleMute={call.toggleMute}
          onToggleDeafen={call.toggleDeafen}
        />
      )}

      {/* ── Messages ── */}
      {/* relative z-10 keeps the message/toolbar stacking contained locally
          (same as server channels), so hover toolbars stay clickable. */}
      {/* Pinned messages bar (Telegram-style): shows the pin nearest above the
          viewport as you scroll; click to jump to it. */}
      {barPin && (
        <button
          type="button"
          onClick={() => jumpToMessage(barPin.id)}
          className="flex shrink-0 items-center gap-2 border-b border-border/20 bg-accent/30 px-4 py-2 text-left transition-colors hover:bg-accent/50"
        >
          <Pin className="h-3.5 w-3.5 shrink-0 text-link" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-link">
              {tm('pinnedCount', { count: pinnedMessages.length })}
            </p>
            <p className="truncate text-[13px] text-muted-foreground">{barPin.content || tm('attachment')}</p>
          </div>
        </button>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex flex-1 flex-col-reverse overflow-y-auto px-4">

        {/* Messages wrapper — normal order, reversed by parent */}
        <div className="flex flex-col justify-end py-4">
          {/* Conversation start — always rendered at the very top of history */}
          <div className="flex flex-col items-start px-2 pb-4 pt-6 text-left">
            {group ? (
              <>
                <div className="mb-3 flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full bg-secondary">
                  {group.avatar
                    ? <Image src={group.avatar} alt={group.name ?? ''} width={68} height={68} className="object-cover" />
                    : <Users className="h-8 w-8 text-link" />}
                </div>
                <p className="text-[26px] font-bold leading-tight">{group.name?.trim() || tm('unnamedGroup')}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tm('groupStart', { name: group.name?.trim() || tm('unnamedGroup') })}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground/70">
                  {(members.length || group.memberCount)} {tm('membersCount')}
                </p>
              </>
            ) : (
              <>
                <div className="relative mb-3 flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full bg-secondary">
                  {otherUser?.avatar_url
                    ? <AvatarImage src={otherUser.avatar_url} alt={otherName} sizes="68px" className="object-cover" animate />
                    : <span className="text-3xl font-bold text-link">{otherInitial}</span>}
                </div>
                <p className="flex items-center gap-1.5 text-[26px] font-bold leading-tight">
                  <span>{renderEmojiNodes(otherName)}</span>
                  {otherUser?.is_verified && <VerifiedBadge size="md" />}
                  {otherUser?.is_moderator && <ModeratorBadge size="md" />}
                </p>
                {otherUser && <p className="mt-0.5 text-[15px] text-muted-foreground">@{otherUser.username}</p>}
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {(() => {
                    // Render the intro so the name's custom emoji show as images
                    // (a plain interpolated string would leak the raw token).
                    const [before, after] = tm('dmStart', { name: '\u0000' }).split('\u0000');
                    return <>{before}{renderEmojiNodes(otherName)}{after ?? ''}</>;
                  })()}
                </p>
              </>
            )}
          </div>

          {messages.map((msg, i) => {
            const isMine    = msg.sender_id === myProfileId;

            // Day separator when the calendar day changes
            const prevForDay = messages[i - 1];
            const showDay = !prevForDay || !sameDay(prevForDay.created_at, msg.created_at);
            const daySep = showDay
              ? <DaySeparator key={`day-${msg.id}`} date={msg.created_at} locale={locale} t={tm} />
              : null;

            // ── System call message ──
            if (msg.type === 'call') {
              const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
                .format(new Date(msg.created_at));
              const who = isMine ? myName : (msg.sender?.display_name ?? msg.sender?.username ?? '?');
              const info = callMessageInfo(tc, msg.content, msg.call_seconds ?? null);
              return (
                <Fragment key={msg.id}>
                  {daySep}
                  <div className="mt-3 flex items-center gap-3 px-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                      <Phone className={cn('h-4 w-4', info.missed ? 'text-destructive' : 'text-success')} />
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      <span className="font-semibold text-foreground/80">{renderEmojiNodes(who)}</span>{' '}
                      {info.text}
                      <span className="ml-2 whitespace-nowrap text-[11px] text-muted-foreground/40">{time}</span>
                    </p>
                  </div>
                </Fragment>
              );
            }

            // ── System group event message ──
            if (msg.type === 'system') {
              const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
                .format(new Date(msg.created_at));
              const who = isMine ? myName : (msg.sender?.display_name ?? msg.sender?.username ?? '?');
              const text = systemMessageText(msg.content, tm);
              const { Icon, cls } = systemMessageIcon(msg.content);
              // A 'pinned' system line jumps to the message that was pinned at
              // that moment: the newest pin whose pinned_at is at/just before
              // this line's timestamp (Telegram-style — click the event to jump).
              const pinTarget = msg.content === 'pinned'
                ? messages.filter(m => m.pinned_at && new Date(m.pinned_at).getTime() <= new Date(msg.created_at).getTime() + 2000)
                    .sort((a, b) => new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime())[0] ?? null
                : null;
              const body = (
                <>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                    <Icon className={cn('h-4 w-4', cls)} />
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    <span className="font-semibold text-foreground/80">{renderEmojiNodes(who)}</span>{' '}
                    {text}
                    <span className="ml-2 whitespace-nowrap text-[11px] text-muted-foreground/40">{time}</span>
                  </p>
                </>
              );
              return (
                <Fragment key={msg.id}>
                  {daySep}
                  {pinTarget ? (
                    <button
                      type="button"
                      onClick={() => jumpToMessage(pinTarget.id)}
                      className="mt-3 flex w-full items-center gap-3 rounded-lg px-2 py-0.5 text-left transition-colors hover:bg-accent/40"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="mt-3 flex items-center gap-3 px-2">{body}</div>
                  )}
                </Fragment>
              );
            }

            const prevMsg   = messages[i - 1];
            // A reply always starts a fresh block (shows avatar + name), even if
            // the previous message is from the same sender within the group window.
            // A system message (pin / group event) breaks the block — the next
            // real message must start fresh with its avatar + name, not tuck
            // under the system line as if grouped.
            const isGrouped = prevMsg?.sender_id === msg.sender_id
              && prevMsg?.type !== 'call' && prevMsg?.type !== 'system'
              && !msg.reply_to
              && new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 5 * 60 * 1000;

            const senderName     = msg.sender?.display_name ?? msg.sender?.username ?? '?';
            const avatarUrl      = isMine ? myProfile?.avatar_url : msg.sender?.avatar_url;
            const showName       = isMine ? myName : senderName;
            const showInit       = showName[0]?.toUpperCase() ?? '?';
            const isVerifiedMsg  = isMine ? !!myProfile?.is_verified : !!msg.sender?.is_verified;
            const isModeratorMsg = isMine ? !!myProfile?.is_moderator : !!msg.sender?.is_moderator;
            const isPremiumMsg   = isMine ? !!myProfile?.is_premium : !!msg.sender?.is_premium;
            const isBotMsg       = !isMine && !!msg.sender?.is_bot;
            const time           = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
              .format(new Date(msg.created_at));

            // Build user object for mini profile popup
            const msgUser = isMine
              ? { username: myProfile?.username ?? '', display_name: myProfile?.display_name ?? null, avatar_url: myProfile?.avatar_url ?? null, is_verified: myProfile?.is_verified, is_moderator: myProfile?.is_moderator }
              : { username: msg.sender?.username ?? '', display_name: msg.sender?.display_name ?? null, avatar_url: msg.sender?.avatar_url ?? null, is_verified: msg.sender?.is_verified, is_moderator: msg.sender?.is_moderator };

            // Resolve replied-to message for the quote
            const repliedMsg = msg.reply_to ? messages.find(x => x.id === msg.reply_to) ?? null : null;
            // A reply to one of my messages (by someone else) is a ping — highlight it.
            const isPing = !isMine && !!repliedMsg && repliedMsg.sender_id === myProfileId;
            // An @-mention of me / @everyone / @here — highlighted yellow.
            const mentionsMe = !isMine && !!myProfile?.username && (
              /@(everyone|here)([^a-z0-9_]|$)/i.test(msg.content) ||
              new RegExp(`@${myProfile.username}([^a-z0-9_]|$)`, 'i').test(msg.content)
            );
            // The message currently selected as the reply target — subtle grey highlight.
            const isReplyTarget = replyTo?.id === msg.id;

            return (
              <Fragment key={msg.id}>
                {daySep}
                <MessageRow
                  messageId={msg.id}
                  isGrouped={isGrouped}
                  isPing={isPing}
                  isReplyTarget={isReplyTarget}
                  mentionsMe={mentionsMe}
                  isMine={isMine}
                  isPinned={!!msg.pinned_at}
                  canEdit={isMine && !msg.pending && !msg.failed}
                  onReply={() => startReply(msg)}
                  onForward={() => forwardMessage(msg)}
                  onCopy={() => copyText(msg.content)}
                  onCopyId={() => navigator.clipboard.writeText(msg.id).catch(() => {})}
                  onDelete={() => deleteMessage(msg.id)}
                  onEdit={() => startEdit(msg)}
                  onPin={() => togglePin(msg)}
                  onReact={(emoji) => toggleDmReaction(msg.id, emoji)}
                  t={tm}
                >

                {/* Reply quote — click to jump to the replied message (chains:
                    the target may itself be a reply, and jumping there shows ITS
                    quote, so you can walk the whole thread up). */}
                {repliedMsg && (
                  <button
                    type="button"
                    onClick={() => jumpToMessage(repliedMsg.id)}
                    className="mb-0.5 flex w-fit max-w-full items-center gap-1.5 pl-14 text-left text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground"
                  >
                    <Reply className="h-3 w-3 shrink-0" />
                    <div className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full bg-link/20">
                      {(repliedMsg.sender_id === myProfileId ? myProfile?.avatar_url : repliedMsg.sender?.avatar_url)
                        ? <AvatarImage src={(repliedMsg.sender_id === myProfileId ? myProfile?.avatar_url : repliedMsg.sender?.avatar_url) as string} alt="" sizes="16px" className="object-cover" />
                        : <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-link">
                            {(repliedMsg.sender_id === myProfileId ? myName : (repliedMsg.sender?.display_name ?? repliedMsg.sender?.username ?? '?'))[0]?.toUpperCase()}
                          </span>}
                    </div>
                    <span className="font-medium">
                      {renderEmojiNodes(repliedMsg.sender_id === myProfileId ? myName : (repliedMsg.sender?.display_name ?? repliedMsg.sender?.username ?? '?'))}
                    </span>
                    <span className="truncate opacity-70">{repliedMsg.content}</span>
                  </button>
                )}

                <div className="relative flex gap-4">
                {/* Avatar / hover time */}
                <div className="w-10 shrink-0 pt-0.5">
                  {!isGrouped ? (
                    isMine ? (
                      <MiniProfilePopup user={msgUser}>
                        <div className="relative h-10 w-10 overflow-hidden rounded-full bg-link/20">
                          {avatarUrl
                            ? <AvatarImage src={avatarUrl} alt={showName} sizes="40px" className="object-cover" />
                            : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-link">{showInit}</span>}
                        </div>
                      </MiniProfilePopup>
                    ) : (
                      <UserContextMenu
                        user={msgUser}
                        conversationId={conversationId}
                        pinned={convPinned}
                        muted={convMuted}
                        onCall={call.startCall}
                        onCloseDm={handleCloseDm}
                        onTogglePin={handleTogglePin}
                        onToggleMute={handleToggleMute}
                      >
                        <MiniProfilePopup user={msgUser}>
                          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-link/20">
                            {avatarUrl
                              ? <AvatarImage src={avatarUrl} alt={showName} sizes="40px" className="object-cover" />
                              : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-link">{showInit}</span>}
                          </div>
                        </MiniProfilePopup>
                      </UserContextMenu>
                    )
                  ) : (
                    <span className="hidden whitespace-nowrap pt-1 text-right text-[10px] text-muted-foreground/40 group-hover:block">{time}</span>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {!isGrouped && (
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <MiniProfilePopup user={msgUser}>
                        <span className={cn('text-[14px] font-semibold leading-tight hover:underline', isPremiumMsg && 'aurora-text aurora-text-glow')}>{renderEmojiNodes(showName)}</span>
                      </MiniProfilePopup>
                      {isBotMsg && <BotBadge size="sm" />}
                      {isVerifiedMsg && <VerifiedBadge size="sm" />}
                      {isModeratorMsg && <ModeratorBadge size="sm" />}
                      {isPremiumMsg && <PremiumBadge size="sm" />}
                      <DeviceBadge userId={msg.sender_id} />
                      <span className="whitespace-nowrap text-[11px] text-muted-foreground/50">{time}</span>
                    </div>
                  )}
                  {(() => {
                    const sticker = stickerOf(msg.content);
                    if (sticker) {
                      return <Sticker url={sticker} pending={msg.pending} />;
                    }
                    // While uploading, show instant local previews from attachments.
                    const atts = msg.uploading && msg.attachments?.length ? msg.attachments : attachmentsOf(msg.content);
                    if (atts) {
                      const allImages = atts.every((a) => a.kind === 'image');
                      // Spoilered media routes through ChatMedia (per-item blur).
                      const anySpoiler = atts.some((a) => a.spoiler);
                      if (allImages && !anySpoiler && atts.length > 1) {
                        return (
                          <ChatAlbum
                            urls={atts.map((a) => a.url)}
                            pending={msg.pending}
                            uploading={msg.uploading}
                            onOpen={(u) => imageViewer.open({ src: u, authorName: showName, authorAvatar: avatarUrl, subtitle: time })}
                          />
                        );
                      }
                      if (allImages && !anySpoiler && atts.length === 1) {
                        const img = atts[0]!.url;
                        return (
                          <ChatGif
                            src={img}
                            pending={msg.pending}
                            uploading={msg.uploading}
                            isFavorite={favGifs.has(img)}
                            onToggleFavorite={msg.uploading || isStorageUrl(img) ? undefined : () => toggleFavGif(img)}
                            favTitle={tm('gifFavorites')}
                            addFavTitle={tm('gifAddFavorite')}
                            onOpen={() => imageViewer.open({ src: img, authorName: showName, authorAvatar: avatarUrl, subtitle: time })}
                          />
                        );
                      }
                      return (
                        <ChatMedia
                          attachments={atts}
                          uploading={msg.uploading}
                          onOpen={(u) => imageViewer.open({ src: u, authorName: showName, authorAvatar: avatarUrl, subtitle: time })}
                        />
                      );
                    }
                    if (editingId === msg.id) {
                      return (
                        <div className="mt-0.5">
                          <textarea
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id); }
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="w-full resize-none rounded-lg bg-accent/60 px-3 py-2 text-[15px] leading-relaxed text-foreground outline-none ring-1 ring-border/40"
                            rows={1}
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground/60">{tm('editHint')}</p>
                        </div>
                      );
                    }
                    return (
                      <MessageText
                        content={msg.content}
                        className={cn(
                          'transition-colors',
                          msg.failed ? 'text-destructive' : msg.pending ? 'text-muted-foreground/50' : 'text-foreground/90',
                        )}
                        suffix={msg.edited_at ? <span className="ml-1 align-baseline text-[11px] text-muted-foreground/40">{tm('edited')}</span> : null}
                      />
                    );
                  })()}
                  {(() => {
                    const it = inviteTokenOf(msg.content);
                    if (it) return <ServerInviteEmbed token={it} />;
                    // Link preview — only for plain text messages (not stickers
                    // or media albums, which own their own rendering).
                    if (!stickerOf(msg.content) && !attachmentsOf(msg.content)) {
                      return <LinkPreview content={msg.content} />;
                    }
                    return null;
                  })()}
                  {msg.failed && (
                    <p className="mt-0.5 text-[12px] font-medium text-destructive/80">
                      {tm('messageNotDelivered')}
                      {msg.failedReason ? <span className="font-normal text-destructive/60"> · {msg.failedReason}</span> : null}
                    </p>
                  )}
                  {!group && msg.id === myLastMsgId && (
                    <span
                      className="absolute bottom-0 right-0 flex items-center"
                      title={myLastReadByOther ? tm('read') : tm('delivered')}
                    >
                      {myLastReadByOther
                        ? <CheckCheck className="h-3.5 w-3.5 text-link" />
                        : <Check className="h-3.5 w-3.5 text-muted-foreground/40" />}
                    </span>
                  )}
                  {(reactions.get(msg.id)?.length ?? 0) > 0 && (
                    <ReactionBar reactions={reactions.get(msg.id)!} onToggle={(e) => toggleDmReaction(msg.id, e)} className="mt-1" />
                  )}
                </div>
                </div>
              </MessageRow>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Typing indicator — floats over the bottom of the list so appearing /
          disappearing never pushes or shifts the conversation. */}
      {isTyping && (
        <div className="pointer-events-none absolute bottom-1 left-0 right-0 flex items-center gap-1.5 px-6 text-[11px] text-muted-foreground/60">
          <TypingDots />
          <span className="truncate">{renderEmojiNodes(group ? (typingName ?? tm('someone')) : otherName)} {tm('typing')}</span>
        </div>
      )}
      </div>

      {/* ── Input ── */}
      <div className="shrink-0 px-4 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {iBlockedThem ? (
          <div className="flex items-center gap-3 rounded-xl bg-accent/60 px-4 py-3">
            <span className="flex-1 text-[13px] text-muted-foreground">{tm('blockedByYou')}</span>
            <button
              type="button"
              onClick={handleUnblock}
              className="shrink-0 rounded-md bg-secondary px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary/80"
            >
              {tm('unblock')}
            </button>
          </div>
        ) : (
        <>
        {/* Anti-spam cooldown popup */}
        {blockedFor > 0 && (
          <RateLimitPopup durationMs={blockedFor} onDismiss={clearBlock} />
        )}
        {/* Reply preview */}
        {replyTo && (
          <div className="mb-1 flex items-center gap-2 rounded-t-lg bg-accent/40 px-3 py-1.5 text-[13px]">
            <Reply className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              {tm('replyingTo')}{' '}
              <span className="font-semibold text-foreground/80">
                {renderEmojiNodes(replyTo.sender_id === myProfileId ? myName : (replyTo.sender?.display_name ?? replyTo.sender?.username ?? '?'))}
              </span>
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground/60">{replyTo.content}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* Attached images — uploaded, not sent yet */}
        <AttachmentTray
          items={att.items}
          onRemove={att.remove}
          onToggleSpoiler={att.toggleSpoiler}
          onRename={att.rename}
          warningText={
            att.warning === 'size' ? tm('fileTooLarge', { mb: uploadLimitMb(myProfile?.is_premium) })
              : att.warning === 'count' ? tm('imagesMax', { max: MAX_CHAT_IMAGES })
              : undefined
          }
          removeLabel={tm('removeImage')}
        />
        <form onSubmit={handleSubmit}>
          {/* Slash-command picker / argument hint (inline, above the input) */}
          {slash.ui}

          {/* @-mention autocomplete */}
          {!slash.active && mention && mentionItems.length > 0 && (
            <div className="surface-solid mb-1 overflow-hidden rounded-xl shadow-2xl ring-1 ring-border/40">
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                {tm('mentionTitle')}
              </p>
              {mentionItems.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); applyMention(it); }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                    i === mentionIdx ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                >
                  <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-link/20 text-[11px] font-bold text-link">
                    {it.special ? (
                      <AtSign className="h-3.5 w-3.5" />
                    ) : it.avatar ? (
                      <AvatarImage src={it.avatar} alt="" sizes="24px" className="object-cover" />
                    ) : (
                      it.label[0]?.toUpperCase() ?? '?'
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{renderEmojiNodes(it.label)}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground/60">{it.sub}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 rounded-xl bg-accent/60 px-3.5 py-2.5">
            {/* Attach — opens a popup menu, then the file picker */}
            <AttachMenu
              title={tm('attach')}
              items={[{
                icon: <Paperclip className="h-[18px] w-[18px]" />,
                label: tm('uploadFile'),
                onClick: () => imgInputRef.current?.click(),
              }]}
            />
            <input
              ref={imgInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => { if (e.target.files) att.addFiles(e.target.files); e.target.value = ''; }}
            />

            {/* Text */}
            <EmojiInput
              ref={textRef}
              maxLength={msgLimit}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={(e) => {
                const files = e.clipboardData?.files;
                if (files && Array.from(files).some((f) => f.size > 0)) {
                  e.preventDefault();
                  att.addFiles(files);
                }
              }}
              placeholder={placeholderLabel}
              className="flex-1 max-h-[160px] overflow-y-auto bg-transparent py-1 text-[15px] leading-relaxed text-foreground outline-none"
            />

            {/* Character counter — appears as you approach the limit */}
            {charCount >= msgLimit - 200 && (
              <span className={cn(
                'shrink-0 text-[11px] font-medium tabular-nums',
                charCount >= msgLimit ? 'text-destructive' : 'text-muted-foreground/60',
              )}>
                {charCount}/{msgLimit}
              </span>
            )}

            {/* GIF picker */}
            <GifPicker onSelect={sendGif}>
              <span
                title={tm('gif')}
                className="flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-bold text-muted-foreground ring-1 ring-muted-foreground/40 transition-colors hover:text-foreground hover:ring-foreground/60"
              >
                GIF
              </span>
            </GifPicker>

            {/* Sticker picker */}
            <StickerPicker onSelect={sendSticker}>
              <span
                title={tm('stickers')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <StickerIcon className="h-5 w-5" />
              </span>
            </StickerPicker>

            {/* Emoji picker */}
            <EmojiPicker onSelect={insertEmoji}>
              <span
                title={tm('emoji')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-7 md:w-7 md:rounded-md"
              >
                <Smile className="h-5 w-5" />
              </span>
            </EmojiPicker>

            {/* Slash commands — type "/" or tap to invoke a bot here. */}
            <button
              type="button"
              title={tm('slashCommands')}
              onClick={slash.trigger}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-7 md:w-7 md:rounded-md"
            >
              <Slash className="h-5 w-5" />
            </button>

            {/* Formatting help — desktop only (keyboard shortcuts hint) */}
            <span className="hidden md:inline"><FormattingHelp /></span>

            {/* Send — always-visible tappable button (Enter still works). Shown
                only when there's something to send so it doesn't crowd the row. */}
            {charCount > 0 && (
              <button
                type="submit"
                aria-label={tm('send')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-link text-white transition-transform active:scale-90 md:h-8 md:w-8"
              >
                <Send className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </form>
        {theyBlockedMe && (
          <p className="mt-1.5 px-1 text-[12px] text-destructive/80">{tm('cannotSendBlocked')}</p>
        )}
        </>
        )}
      </div>
    </div>
  );
}

/* ── Day separator helpers ── */
function sameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function DaySeparator({
  date, locale, t,
}: {
  date: string; locale: string; t: (k: string) => string;
}) {
  const d     = new Date(date);
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);

  let label: string;
  if (diffDays === 0)      label = t('today');
  else if (diffDays === 1) label = t('yesterday');
  else label = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);

  return (
    <div className="my-4 flex items-center gap-3 px-2">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{label}</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

/* ── Call system message text ── */
function callMessageInfo(
  t: (key: string, values?: Record<string, string | number>) => string,
  content: string,
  seconds: number | null,
): { text: string; missed: boolean } {
  if (content === 'started') {
    return { text: t('started'), missed: false };
  }
  if (seconds == null || seconds < 0) {
    return { text: t('missed'), missed: true };
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return { text: t('ended', { duration: `${m}:${s.toString().padStart(2, '0')}` }), missed: false };
}

/* ── Message row wrapper — manages hover state so toolbar stays visible when
     the pointer moves from message text onto the toolbar itself ── */
function MessageRow({
  messageId, isGrouped, isPing, isReplyTarget, mentionsMe,
  isMine, isPinned, canEdit, onReply, onForward, onCopy, onCopyId, onDelete, onEdit, onPin, onReact, t,
  children,
}: {
  messageId: string;
  isGrouped: boolean;
  isPing: boolean;
  isReplyTarget: boolean;
  mentionsMe: boolean;
  isMine: boolean;
  isPinned: boolean;
  canEdit: boolean;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onCopyId: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onPin: () => void;
  onReact: (emoji: string) => void;
  t: (key: string) => string;
  children: React.ReactNode;
}) {
  // Touch has no hover, so a tap on the bubble toggles the action toolbar
  // (revealed via `open`). Ignored on desktop, where hover reveals it. Taps on
  // links / buttons / media inside the message don't toggle (they act normally).
  const [open, setOpen] = useState(false);
  function onRowClick(e: React.MouseEvent) {
    if (window.matchMedia('(hover: hover)').matches) return; // desktop → hover
    const target = e.target as HTMLElement;
    if (target.closest('a, button, img, video, [role="button"], input, textarea, [contenteditable]')) return;
    setOpen((v) => !v);
  }
  return (
    <div
      data-mid={messageId}
      onClick={onRowClick}
      className={cn(
        // hover:z-10 lifts the hovered row (and its z-30 toolbar) above the
        // adjacent rows, so the toolbar buttons are actually clickable and not
        // covered by the neighbouring message's box.
        'group relative rounded px-2 py-0.5 hover:z-10',
        open && 'z-10',
        isGrouped ? 'mt-0' : 'mt-5',
        'hover:bg-white/[0.02]',
        isPing && 'border-l-2 border-link bg-link/[0.06] hover:bg-link/[0.08]',
        isReplyTarget && 'bg-white/[0.05] hover:bg-white/[0.05]',
        mentionsMe && 'border-l-2 border-warning bg-warning/[0.08] hover:bg-warning/[0.12]',
      )}
    >
      {children}
      {/* Actions toolbar — rendered LAST so it paints above the message content.
          Desktop reveals it on hover; touch reveals it via `open` (tap). */}
      <MessageActions
        forceOpen={open}
        isMine={isMine}
        isPinned={isPinned}
        canEdit={canEdit}
        onReply={onReply}
        onForward={onForward}
        onCopy={onCopy}
        onCopyId={onCopyId}
        onDelete={onDelete}
        onEdit={onEdit}
        onPin={onPin}
        onReact={onReact}
        t={t}
      />
    </div>
  );
}

/* ── Hover toolbar + dropdown for a message ── */
function MessageActions({
  isMine, isPinned, canEdit, onReply, onForward, onCopy, onCopyId, onDelete, onEdit, onPin, onReact, t, forceOpen = false,
}: {
  isMine: boolean;
  isPinned: boolean;
  canEdit: boolean;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onCopyId: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onPin: () => void;
  onReact: (emoji: string) => void;
  t: (key: string) => string;
  /** Touch: parent row tapped → reveal the toolbar (no hover on touch). */
  forceOpen?: boolean;
}) {
  const tr = useT('reactions');
  const [menuOpen, setMenuOpen] = useState(false);
  const [coords, setCoords]     = useState({ top: 0, left: 0 });
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const W = 180, H = 200;
    let left = rect.right - W + window.scrollX;
    if (left < 8) left = 8;
    let top = rect.bottom + 4 + window.scrollY;
    if (rect.bottom + H + 4 > window.innerHeight) {
      top = rect.top - H - 4 + window.scrollY;
      if (top < window.scrollY + 8) top = window.scrollY + 8;
    }
    setCoords({ top, left });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onOutside); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  return (
    <div className={cn('surface-solid absolute top-0.5 right-3 z-30 items-center gap-0.5 rounded-lg border border-border p-0.5 shadow-md', (menuOpen || forceOpen) ? 'flex' : 'hidden group-hover:flex')}>
      <EmojiPicker onSelect={onReact} title={tr('add')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8">
        <Smile className="h-4 w-4" />
      </EmojiPicker>
      <button type="button" onClick={onReply} title={t('reply')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8">
        <Reply className="h-4 w-4" />
      </button>
      <button type="button" onClick={onForward} title={t('forward')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8">
        <CornerUpRight className="h-4 w-4" />
      </button>
      {/* Quick access: edit (own) + pin (either participant) — no menu dive. */}
      {canEdit && (
        <button type="button" onClick={onEdit} title={t('edit')}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8">
          <Pencil className="h-4 w-4" />
        </button>
      )}
      <button type="button" onClick={onPin} title={isPinned ? t('unpin') : t('pin')}
        className={cn('flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8', isPinned ? 'text-link' : 'text-muted-foreground')}>
        <Pin className="h-4 w-4" />
      </button>
      <button ref={btnRef} type="button" onClick={() => setMenuOpen(v => !v)} title={t('more')}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8">
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999 }}
          className="surface-solid w-44 overflow-hidden rounded-lg border border-border py-1 shadow-xl animate-fade-in"
        >
          <MenuItem icon={<Reply className="h-4 w-4" />}         label={t('reply')}    onClick={() => { setMenuOpen(false); onReply(); }} />
          <MenuItem icon={<CornerUpRight className="h-4 w-4" />} label={t('forward')}  onClick={() => { setMenuOpen(false); onForward(); }} />
          <MenuItem icon={<Copy className="h-4 w-4" />}          label={t('copyText')} onClick={() => { setMenuOpen(false); onCopy(); }} />
          <MenuItem icon={<Hash className="h-4 w-4" />}          label={t('copyId')}   onClick={() => { setMenuOpen(false); onCopyId(); }} />
          {/* Either participant can pin/unpin in a DM (Telegram-style). */}
          <MenuItem icon={<Pin className="h-4 w-4" />} label={isPinned ? t('unpin') : t('pin')} onClick={() => { setMenuOpen(false); onPin(); }} />
          {canEdit && (
            <MenuItem icon={<Pencil className="h-4 w-4" />} label={t('edit')} onClick={() => { setMenuOpen(false); onEdit(); }} />
          )}
          {isMine && (
            <>
              <div className="my-1 h-px bg-border/60" />
              <MenuItem icon={<Trash2 className="h-4 w-4" />} label={t('delete')} danger onClick={() => { setMenuOpen(false); onDelete(); }} />
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-3 py-2 text-[13px] font-medium transition-colors',
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent',
      )}
    >
      <span>{label}</span>
      <span className={danger ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
    </button>
  );
}
