'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Hash, Smile, Palette, Pin, Menu } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { uploadLimitBytes, withAttachmentMeta, attachmentsOf } from '@/lib/utils/media';
import { useT } from '@/providers/i18n-provider';
import { ChatDaySeparator, EmojiPicker, isSameCalendarDay, renderEmojiNodes, useViewerTimeZone } from '@/components/ui';
import { ReactionBar } from '@/components/ui/reaction-bar';
import { preloadEmojiData } from '@/components/ui/emoji-picker';
import { loadServerEmojis, resolveEmojiShortcodes } from '@/lib/emoji';
import { useImageViewer } from '@/features/media';
import { useChatAttachments, uploadDirect } from '@/features/media';
import { PopoutButton } from '@/components/shell/popout-button';
import { openNavDrawer } from '@/components/shell';
import { useRateLimit } from '@/lib/rate-limit';
import { getDraft, setDraft, clearDraft } from '@/lib/utils/drafts';
import type { EmojiInputHandle } from '@/components/ui';
import type { PendingFile } from '@/features/media';

import { PERM, hasPerm } from '../roles/permissions';
import { ChannelThemeEditor, type ChannelTheme } from './channel-theme';
import { triggerPushForMessage } from '@/features/notifications';
import { useChannelMessages, type ChannelMessage } from './use-channel-messages';
import { useChannelReactions } from './use-channel-reactions';
import { useTypingIndicator } from './use-typing-indicator';
import { useScrollBehavior } from './use-scroll-behavior';
import { MessageItem } from './message-item';
import { ActionItem } from './message-actions';
import { MessageComposer } from './message-composer';

// ── TypingDots (tiny, stays here — not worth a file) ──────────────────────────
function TypingDots() {
  return (
    <span className="flex items-center gap-1">
      <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
      <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
      <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
    </span>
  );
}

// ── Public types ──────────────────────────────────────────────────────────────
interface MyProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
}

interface Member { id: string; username: string; display_name: string | null; avatar_url?: string | null }

interface CtxMenu {
  id: string;
  x: number;
  y: number;
  isMine: boolean;
  content: string;
  editable: boolean;
}

export interface ChannelChatProps {
  channelId: string;
  channelName: string;
  initialMessages: ChannelMessage[];
  myProfile: MyProfile | null;
  members?: Member[];
  isOwner?: boolean;
  myPermissions?: number;
  serverId?: string;
  initialTheme?: ChannelTheme;
  myTimeoutUntil?: string | null;
  myTimeoutReason?: string | null;
  locale: string;
}

// ── Main component ────────────────────────────────────────────────────────────
export function ChannelChat({
  channelId,
  channelName,
  initialMessages,
  myProfile,
  members = [],
  isOwner = false,
  myPermissions = 0,
  serverId,
  initialTheme,
  myTimeoutUntil = null,
  myTimeoutReason = null,
  locale,
}: ChannelChatProps) {
  const tm = useT('messages');
  const ts = useT('servers');
  const tr = useT('reactions');
  const viewerTimeZone = useViewerTimeZone();
  const imageViewer = useImageViewer();

  // ── Timeout countdown ────────────────────────────────────────────────────
  const [nowTs, setNowTs] = useState(() => Date.now());
  const timeoutUntilMs = myTimeoutUntil ? new Date(myTimeoutUntil).getTime() : 0;
  const timedOut = timeoutUntilMs > nowTs;
  useEffect(() => {
    if (!timedOut) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timedOut]);

  // ── Preload emoji data ───────────────────────────────────────────────────
  useEffect(() => {
    preloadEmojiData();
    if (serverId) loadServerEmojis(serverId).catch(() => {});
  }, [serverId]);

  // ── Permission flags ─────────────────────────────────────────────────────
  const canSend = !timedOut && (isOwner || hasPerm(myPermissions, PERM.SEND_MESSAGES));
  const canManageMessages = isOwner || hasPerm(myPermissions, PERM.MANAGE_MESSAGES);
  const canEmoji = isOwner || hasPerm(myPermissions, PERM.USE_EMOJI);
  const canGif = isOwner || hasPerm(myPermissions, PERM.USE_GIF);
  const canTheme = isOwner || hasPerm(myPermissions, PERM.CHANGE_THEME);
  const canReact = isOwner || hasPerm(myPermissions, PERM.ADD_REACTIONS);

  // ── Theme ────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<ChannelTheme>(initialTheme ?? { image: null, dim: 0.4, x: 100, y: 0 });
  const [themeOpen, setThemeOpen] = useState(false);

  // ── Data hooks ───────────────────────────────────────────────────────────
  const myId = myProfile?.id ?? '';
  const myName = myProfile?.display_name ?? myProfile?.username ?? '';

  const { messages, setMessages, chanRef, sbRef } = useChannelMessages({
    channelId,
    myId,
    initialMessages,
  });

  const { reactions, toggleReaction } = useChannelReactions({ channelId, messages, sbRef });

  const { typers, broadcastTyping } = useTypingIndicator({
    channelId,
    myId,
    myName,
    chanRef,
  });

  const { scrollRef, contentRef, onScroll } = useScrollBehavior({
    scrollDeps: [messages.length, Object.keys(typers).length],
  });

  // ── GIF favorites ────────────────────────────────────────────────────────
  const [favGifs, setFavGifs] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).from('gif_favorites').select('url').then(({ data }: { data: { url: string }[] | null }) => {
      if (active && data) setFavGifs(new Set(data.map((r) => r.url)));
    });
    return () => { active = false; };
  }, [sbRef]);

  async function toggleFavGif(url: string) {
    const sb = sbRef.current;
    if (favGifs.has(url)) {
      setFavGifs((prev) => { const n = new Set(prev); n.delete(url); return n; });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('gif_favorites').delete().eq('url', url);
    } else {
      setFavGifs((prev) => new Set(prev).add(url));
      const { data: { user } } = await sb.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (user) await (sb as any).from('gif_favorites').insert({ user_id: user.id, url, preview: url });
    }
  }

  // ── Active channel global ref (notifier skip) ────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__prostoActiveChannelId = channelId;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).__prostoActiveChannelId === channelId) (window as any).__prostoActiveChannelId = null;
    };
  }, [channelId]);

  // ── Jump-to-message (from a mention notification: /s/pid/chan?m=<id>) ─────
  // Scroll the target message into view and flash a highlight (Discord-style).
  const searchParams = useSearchParams();
  const jumpParam = searchParams.get('m');
  const [jumpId, setJumpId] = useState<string | null>(null);
  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!jumpParam || jumpedRef.current === jumpParam) return;
    // Wait until the message is present in the list before scrolling to it.
    if (!messages.some((m) => m.id === jumpParam)) return;
    jumpedRef.current = jumpParam;
    setJumpId(jumpParam);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-mid="${jumpParam}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clear = setTimeout(() => setJumpId(null), 2400);
    return () => clearTimeout(clear);
  }, [jumpParam, messages]);

  // ── Persistent per-channel read state (Discord-style) ────────────────────
  // Mark on open, whenever the latest rendered message changes, when a hidden
  // tab becomes visible, and once more on visible navigation away. Requests are
  // coalesced so realtime + safety-poll updates cannot race each other. Badge
  // consumers reload only after the RPC commits; dispatching before completion
  // allowed a stale get_channel_unreads response to restore the unread state.
  const readBoundaryId = [...messages]
    .reverse()
    .find((message) => !message.id.startsWith('opt-'))?.id ?? null;
  const readBoundaryIdRef = useRef(readBoundaryId);
  const readVersionRef = useRef<string | null>(null);
  const requestChannelReadRef = useRef<(() => void) | null>(null);
  readBoundaryIdRef.current = readBoundaryId;

  useEffect(() => {
    if (!channelId) return;
    const sb = sbRef.current;
    let inFlight = false;
    let queued = false;
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const currentVersion = () => `${channelId}:${readBoundaryIdRef.current ?? ''}`;

    const scheduleRetry = () => {
      if (!mounted || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        markRead();
      }, 1000);
    };

    const markRead = () => {
      // Messages delivered while the tab is hidden have not actually been read.
      if (document.visibilityState !== 'visible') return;
      const boundaryId = readBoundaryIdRef.current;
      if (!boundaryId) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (inFlight) {
        queued = true;
        return;
      }

      inFlight = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void Promise.resolve((sb as any).rpc('mark_channel_read_through', {
        p_channel: channelId,
        p_message: boundaryId,
      }))
        .then(
          ({ error }: { error?: unknown }) => {
            if (error) {
              scheduleRetry();
              return;
            }
            window.dispatchEvent(new CustomEvent('prosto:channel-read', { detail: { channelId } }));
          },
          scheduleRetry,
        )
        .finally(() => {
          inFlight = false;
          if (!queued) return;
          queued = false;
          markRead();
        });
    };

    requestChannelReadRef.current = markRead;
    readVersionRef.current = currentVersion();
    markRead();

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      readVersionRef.current = currentVersion();
      markRead();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      // SPA navigation does not cancel this Supabase request; its success event
      // reconciles the still-mounted rail/sidebar after the route has changed.
      markRead();
      if (requestChannelReadRef.current === markRead) requestChannelReadRef.current = null;
    };
  }, [channelId, sbRef]);

  useEffect(() => {
    const version = `${channelId}:${readBoundaryId ?? ''}`;
    if (readVersionRef.current === version) return;
    readVersionRef.current = version;
    requestChannelReadRef.current?.();
  }, [channelId, readBoundaryId]);

  // ── Composer state ───────────────────────────────────────────────────────
  const [replyTo, setReplyTo] = useState<ChannelMessage | null>(null);
  const [charCount, setCharCount] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<EmojiInputHandle>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const msgLimit = myProfile?.is_premium ? 4000 : 2000;
  const { acquire: acquireSend, blockedFor, clearBlock } = useRateLimit('message');
  const att = useChatAttachments(uploadLimitBytes(myProfile?.is_premium));

  // Restore draft on mount, persist on unmount.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const d = getDraft('channel', channelId);
    if (d) {
      el.value = d;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
      setCharCount(d.length);
    }
    return () => { setDraft('channel', channelId, textRef.current?.value ?? ''); };
  }, [channelId]);

  /* ── Discord-style composer shortcuts (see chat-window for the rationale) ──
     Start typing anywhere → focus composer; ↑ on empty → edit my last message;
     Esc → clear the reply preview. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = textRef.current;
      if (!el) return;
      const active = document.activeElement as HTMLElement | null;
      const inField = !!active && (active.isContentEditable
        || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

      if (e.key === 'Escape' && !inField && replyTo) { setReplyTo(null); return; }
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'ArrowUp' && !el.value.trim() && !editing) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m && m.sender_id === myId && !m.pending && !m.failed && !attachmentsOf(m.content) && m.content !== 'sys:theme' && m.content !== 'sys:pin') {
            e.preventDefault();
            setEditing(m.id);
            return;
          }
        }
        return;
      }
      if (e.key.length === 1 && !e.repeat) el.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, myId, replyTo, editing]);

  // ── Send helpers ─────────────────────────────────────────────────────────
  async function sendContent(content: string, replyId: string | null) {
    const gate = acquireSend();
    if (!gate.ok) return;
    const tempId = `opt-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId, content, created_at: new Date().toISOString(), sender_id: myId,
        reply_to: replyId, pending: true,
        sender: { username: myProfile?.username ?? '', display_name: myProfile?.display_name ?? null, avatar_url: myProfile?.avatar_url ?? null, is_verified: myProfile?.is_verified, is_moderator: myProfile?.is_moderator },
      },
    ]);
    setReplyTo(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sbRef.current as any).rpc('send_channel_message', { p_channel: channelId, body: content, reply: replyId });
    setMessages((prev) => prev.map((m) => {
      if (m.id !== tempId) return m;
      if (error) return { ...m, pending: false, failed: true };
      const row = Array.isArray(data) ? data[0] : data;
      return { ...m, id: row?.msg_id ?? m.id, created_at: row?.msg_created_at ?? m.created_at, pending: false };
    }));
    // Background push to pinged members (server sends only on a real mention).
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.msg_id) triggerPushForMessage('channel', row.msg_id as string);
    }
  }

  async function sendAttachments(pending: PendingFile[], replyId: string | null) {
    const tempId = `opt-${Date.now()}-att`;
    const previews = pending.map((p) => ({ url: p.previewUrl, kind: p.kind, name: p.name ?? p.file.name, size: p.file.size, progress: 0, ...(p.spoiler ? { spoiler: true } : {}) }));
    setMessages((prev) => [...prev, { id: tempId, content: '', created_at: new Date().toISOString(), sender_id: myId, reply_to: replyId, pending: true, uploading: true, attachments: previews, sender: { username: myProfile?.username ?? '', display_name: myProfile?.display_name ?? null, avatar_url: myProfile?.avatar_url ?? null } }]);

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

    if (urls.length === 0) { setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, uploading: false, pending: false, failed: true } : m)); return; }
    const body = urls.join('\n');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sbRef.current as any).rpc('send_channel_message', { p_channel: channelId, body, reply: replyId });
    setMessages((prev) => prev.map((m) => {
      if (m.id !== tempId) return m;
      if (error) return { ...m, uploading: false, pending: false, failed: true };
      const row = Array.isArray(data) ? data[0] : data;
      return { ...m, id: row?.msg_id ?? m.id, created_at: row?.msg_created_at ?? m.created_at, content: body, attachments: undefined, uploading: false, pending: false };
    }));
  }

  function send() {
    const content = resolveEmojiShortcodes(textRef.current?.value.trim() ?? '');
    if (!content && att.count === 0) return;
    const replyId = replyTo && !replyTo.id.startsWith('opt-') ? replyTo.id : null;
    const pending = att.take();
    if (textRef.current) { textRef.current.value = ''; textRef.current.style.height = 'auto'; }
    setCharCount(0);
    setReplyTo(null);
    clearDraft('channel', channelId);
    if (content) sendContent(content, replyId);
    if (pending.length) void sendAttachments(pending, content ? null : replyId);
  }

  async function deleteMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).rpc('delete_channel_message', { p_message: id });
  }

  async function saveEdit(id: string) {
    const value = editRef.current?.value.trim() ?? '';
    if (!value) { setEditing(null); return; }
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: value, edited_at: new Date().toISOString() } : m)));
    setEditing(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).rpc('edit_channel_message', { p_message: id, p_body: value });
  }

  // Pin / unpin a channel message (needs MANAGE_MESSAGES; the realtime UPDATE
  // confirms it for everyone).
  async function togglePin(id: string) {
    const msg = messages.find((m) => m.id === id);
    const pinning = !msg?.pinned_at;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned_at: pinning ? new Date().toISOString() : null } : m)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).rpc('pin_channel_message', { p_message: id, p_pin: pinning });
  }

  const pinnedMessages = messages.filter((m) => m.pinned_at)
    .sort((a, b) => new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime());
  // Telegram-style dynamic bar: show the pin nearest above the viewport top.
  const pinnedByPosition = messages.filter((m) => m.pinned_at);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || pinnedByPosition.length === 0) { setActivePinId(null); return; }
    const update = () => {
      const top = scroller.getBoundingClientRect().top;
      let current: string | null = null;
      for (const p of pinnedByPosition) {
        const el = scroller.querySelector(`[data-mid="${p.id}"]`);
        if (el && el.getBoundingClientRect().top <= top + 56) current = p.id;
      }
      setActivePinId(current ?? pinnedByPosition[0]?.id ?? null);
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedByPosition.map((p) => p.id).join(',')]);
  const barPin = pinnedMessages.find((p) => p.id === activePinId) ?? pinnedMessages[0] ?? null;
  function jumpToChannelMessage(id: string) {
    const el = document.querySelector(`[data-mid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setJumpId(id);
    setTimeout(() => setJumpId(null), 2400);
  }

  // ── Context menu ─────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('scroll', close, true); document.removeEventListener('keydown', onKey); };
  }, [ctxMenu]);

  // ── Drag-and-drop ────────────────────────────────────────────────────────
  function dragHasFiles(e: React.DragEvent) { return Array.from(e.dataTransfer?.types ?? []).includes('Files'); }
  function onDragEnter(e: React.DragEvent) { if (!canGif || !dragHasFiles(e)) return; dragDepth.current += 1; setDragOver(true); }
  function onDragOver(e: React.DragEvent) { if (canGif && dragHasFiles(e)) e.preventDefault(); }
  function onDragLeave() { dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragOver(false); } }
  function onDrop(e: React.DragEvent) {
    if (!canGif || !dragHasFiles(e)) return;
    e.preventDefault(); dragDepth.current = 0; setDragOver(false);
    att.addFiles(e.dataTransfer.files); textRef.current?.focus();
  }

  const typerNames = Object.values(typers);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="animate-fade-in relative flex min-w-0 flex-1 flex-col overflow-hidden"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-link px-10 py-8">
            <p className="text-[15px] font-semibold text-foreground">{tm('dropToAttach')}</p>
          </div>
        </div>
      )}

      {/* Channel wallpaper */}
      {theme.image && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.image} alt="" className="h-full w-full object-cover" style={{ transform: `scale(${Math.max(100, theme.x || 100) / 100})`, transformOrigin: 'center' }} />
          <div className="absolute inset-0 bg-background" style={{ opacity: theme.dim }} />
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/20 bg-background/90 px-3 md:px-4">
        {/* Open the channel-list drawer (mobile only — desktop shows it inline) */}
        <button
          type="button"
          onClick={openNavDrawer}
          aria-label={ts('channelList')}
          className="chat-back -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Hash className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[15px] font-semibold">{channelName}</span>
        <div className="ml-auto flex items-center gap-1">
          {canTheme && serverId && (
            <button type="button" onClick={() => setThemeOpen(true)} title={ts('channelTheme')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Palette className="h-[18px] w-[18px]" />
            </button>
          )}
          <PopoutButton />
        </div>
      </div>

      {themeOpen && serverId && (
        <ChannelThemeEditor serverId={serverId} channelId={channelId} initial={theme}
          onClose={() => setThemeOpen(false)} onApplied={setTheme} />
      )}

      {/* Pinned messages bar (Telegram-style): shows the pin nearest above the
          viewport as you scroll; click to jump to it. */}
      {barPin && (
        <button
          type="button"
          onClick={() => jumpToChannelMessage(barPin.id)}
          className="relative z-10 flex shrink-0 items-center gap-2 border-b border-border/20 bg-accent/30 px-4 py-2 text-left transition-colors hover:bg-accent/50"
        >
          <Pin className="h-3.5 w-3.5 shrink-0 text-link" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-link">{tm('pinnedCount', { count: pinnedMessages.length })}</p>
            <p className="truncate text-[13px] text-muted-foreground">{barPin.content || tm('attachment')}</p>
          </div>
        </button>
      )}

      {/* Message list */}
      <div ref={scrollRef} onScroll={onScroll}
        className="scrollbar-auto-hide relative z-10 flex flex-1 flex-col overflow-y-auto px-4 py-4">
        <div ref={contentRef} className="mt-auto flex flex-col">
          {/* Channel start banner */}
          <div className="mb-3 flex flex-col px-2 pt-4">
            <div className="mb-3 flex h-[68px] w-[68px] items-center justify-center rounded-full bg-accent">
              <Hash className="h-9 w-9 text-foreground" />
            </div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight">{ts('channelWelcome', { name: channelName })}</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">{ts('channelStart', { name: channelName })}</p>
          </div>

          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const startsNewDay = !prev || !isSameCalendarDay(prev.created_at, msg.created_at, viewerTimeZone);
            return (
              <Fragment key={msg.id}>
                {startsNewDay && (
                  <ChatDaySeparator
                    date={msg.created_at}
                    locale={locale}
                    timeZone={viewerTimeZone}
                    todayLabel={tm('today')}
                    yesterdayLabel={tm('yesterday')}
                  />
                )}
                <div data-mid={msg.id} className={cn(jumpId === msg.id && 'jump-highlight rounded-lg')}>
            <MessageItem
              msg={msg}
              prev={startsNewDay ? undefined : prev}
              allMessages={messages}
              myId={myId}
              myName={myName}
              myProfile={myProfile}
              locale={locale}
              canManageMessages={canManageMessages}
              canGif={canGif}
              canReact={canReact}
              isOwner={isOwner}
              serverId={serverId}
              reactions={reactions}
              favGifs={favGifs}
              editState={{ editingId: editing, editRef, msgLimit, onSaveEdit: saveEdit, onCancelEdit: () => setEditing(null) }}
              sysThemeChangedLabel={ts('sysThemeChanged')}
              sysPinnedLabel={tm('sysPinned')}
              gifFavTitle={tm('gifFavorites')}
              gifAddFavTitle={tm('gifAddFavorite')}
              sendFailedLabel={tm('sendFailed')}
              editHintLabel={tm('editHint')}
              editedLabel={tm('edited')}
              onContextMenu={(e, m, isMine, editable) => {
                e.preventDefault();
                setCtxMenu({ id: m.id, x: e.clientX, y: e.clientY, isMine, content: m.content, editable });
              }}
              onReply={setReplyTo}
              onForward={(m) => { const el = textRef.current; if (el) { el.value = m.content; el.focus(); setCharCount(el.value.length); setReplyTo(null); } }}
              onCopy={(text) => navigator.clipboard.writeText(text).catch(() => {})}
              onStartEdit={setEditing}
              onPin={togglePin}
              onCopyId={(id) => navigator.clipboard.writeText(id).catch(() => {})}
              onDelete={deleteMessage}
              onReact={toggleReaction}
              onToggleFavGif={toggleFavGif}
              onOpenImage={(src, name, avatar, subtitle) => imageViewer.open({ src, authorName: name, authorAvatar: avatar ?? undefined, subtitle })}
              onJumpTo={jumpToChannelMessage}
            />
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && typeof document !== 'undefined' && createPortal(
        <div
          className="surface-solid fixed z-[9999] min-w-[180px] overflow-hidden rounded-lg border border-border py-1 shadow-2xl animate-pop-in"
          style={{ top: Math.min(ctxMenu.y, window.innerHeight - 230), left: Math.min(ctxMenu.x, window.innerWidth - 200) }}
          onClick={(e) => e.stopPropagation()}
        >
          {canReact && (
            <EmojiPicker onSelect={(e) => { toggleReaction(ctxMenu.id, e); setCtxMenu(null); }} serverId={serverId}
              className="flex w-full items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent">
              <span>{tr('add')}</span>
            </EmojiPicker>
          )}
          <ActionItem icon={null} label={tm('reply')} onClick={() => { const m = messages.find((x) => x.id === ctxMenu.id); if (m) setReplyTo(m); setCtxMenu(null); }} />
          <ActionItem icon={null} label={tm('forward')} onClick={() => { const m = messages.find((x) => x.id === ctxMenu.id); if (m) { const el = textRef.current; if (el) { el.value = m.content; el.focus(); setCharCount(el.value.length); } } setCtxMenu(null); }} />
          <ActionItem icon={null} label={tm('copyText')} onClick={() => { navigator.clipboard.writeText(ctxMenu.content).catch(() => {}); setCtxMenu(null); }} />
          {ctxMenu.editable && <ActionItem icon={null} label={tm('edit')} onClick={() => { setEditing(ctxMenu.id); setCtxMenu(null); }} />}
          {canManageMessages && (
            <ActionItem
              icon={null}
              label={messages.find((x) => x.id === ctxMenu.id)?.pinned_at ? tm('unpin') : tm('pin')}
              onClick={() => { togglePin(ctxMenu.id); setCtxMenu(null); }}
            />
          )}
          {(ctxMenu.isMine || isOwner) && (
            <>
              <div className="my-1 h-px bg-border/60" />
              <ActionItem icon={null} label={tm('delete')} danger onClick={() => { deleteMessage(ctxMenu.id); setCtxMenu(null); }} />
            </>
          )}
        </div>,
        document.body,
      )}

      {/* Typing indicator + composer */}
      <div className="relative z-10">
        <div className="flex h-4 items-center gap-2 px-5 pb-1 text-[12px] text-muted-foreground">
          {typerNames.length > 0 && (
            <>
              <TypingDots />
              <span className="truncate">
                {typerNames.length === 1
                  ? <>{renderEmojiNodes(typerNames[0] ?? '')} {tm('typing')}</>
                  : tm('severalTyping')}
              </span>
            </>
          )}
        </div>
        <MessageComposer
          channelId={channelId}
          channelName={channelName}
          myId={myId}
          myName={myName}
          isPremium={myProfile?.is_premium}
          canSend={canSend}
          canGif={canGif}
          canEmoji={canEmoji}
          timedOut={timedOut}
          timeoutUntilMs={timeoutUntilMs}
          nowTs={nowTs}
          myTimeoutReason={myTimeoutReason}
          serverId={serverId}
          members={members}
          replyTo={replyTo}
          blockedFor={blockedFor}
          attItems={att.items}
          attWarning={att.warning}
          charCount={charCount}
          setCharCount={setCharCount}
          textRef={textRef}
          imgInputRef={imgInputRef}
          onAddFiles={att.addFiles}
          onRemoveAttachment={att.remove}
          onToggleSpoiler={att.toggleSpoiler}
          onRenameAttachment={att.rename}
          onSend={send}
          onSendContent={sendContent}
          onSetReplyTo={setReplyTo}
          onInputChange={() => { setDraft('channel', channelId, textRef.current?.value ?? ''); broadcastTyping(); }}
          onClearBlock={clearBlock}
          onTakeAttachments={att.take}
        />
      </div>
    </div>
  );
}
