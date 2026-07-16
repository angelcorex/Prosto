'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Users, X, Pin, BellOff, Plus, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';

import { cn }            from '@/lib/utils/cn';
import { site }          from '@/config';
import { VerifiedBadge, ModeratorBadge, PremiumBadge, BotBadge, UserContextMenu, EmojiText, renderEmojiNodes } from '@/components/ui';
import { AvatarWithStatus } from '@/features/presence';
import { usePresence, DeviceBadge } from '@/features/presence';
import { useIncomingFriendRequests } from '@/features/notifications';
import { useT }          from '@/providers/i18n-provider';
import { CreateGroupModal, GroupContextMenu } from '@/features/groups';

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
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  unread: Record<string, boolean>;
  typing: Record<string, string[]>;
  dmLabel: string;
  newDmLabel: string;
  emptyLabel: string;
  onHide: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onToggleMute: (id: string, muted: boolean) => void;
}

export function ConversationList({
  conversations,
  activeId,
  unread,
  typing,
  dmLabel,
  emptyLabel,
  onHide,
  onTogglePin,
  onToggleMute,
}: ConversationListProps) {
  const t = useT('messages');
  const tSuper = useT('super');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const incomingRequests = useIncomingFriendRequests();

  return (
    <div className="flex h-full w-full flex-col">

      {/* ── "Find or start a conversation" button ── */}
      <div className="px-2.5 pt-3 pb-2">
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          className={cn(
            'w-full rounded-md bg-secondary px-2.5 py-1.5 text-center text-[13px]',
            'text-muted-foreground transition-colors hover:bg-secondary/80',
          )}
        >
          {t('findConversation')}
        </button>
      </div>

      {/* ── Friends tab ── */}
      <div className="px-2 pb-1">
        <Link
          href="/friends"
          className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <Users className="h-5 w-5 shrink-0" />
          <span className="flex-1">{t('friends')}</span>
          {incomingRequests > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-white tabular-nums shadow-sm">
              {incomingRequests > 99 ? '99+' : incomingRequests}
            </span>
          )}
        </Link>
      </div>

      {/* ── Super Prosto tab — pastel glow on the text only ── */}
      <div className="px-2 pb-1">
        <Link
          href={site.routes.super}
          className="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-accent/40"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-[#b3a8ff]" />
          <span className="aurora-text aurora-text-glow flex-1 font-semibold">{tSuper('name')}</span>
        </Link>
      </div>

      {/* ── DM label ── */}
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-[12px] font-normal text-muted-foreground/50">
          {dmLabel}
        </span>
        <button
          type="button"
          onClick={() => setGroupOpen(true)}
          title={t('createGroup')}
          className="flex h-4 w-4 items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* ── Conversation list ── */}
      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2">
        {conversations.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground/50">
            {emptyLabel}
          </p>
        )}
        {conversations.map(conv => (
          <ConversationRow
            key={conv.id}
            conv={conv}
            active={(conv.routeId ?? conv.otherUser.public_id) != null && (conv.routeId ?? conv.otherUser.public_id) === activeId}
            unread={!!unread[conv.id]}
            typing={typing[conv.id] ?? []}
            onHide={() => onHide(conv.id)}
            onTogglePin={() => onTogglePin(conv.id, !conv.pinned)}
            onToggleMute={() => onToggleMute(conv.id, !conv.muted)}
          />
        ))}
      </div>

      {/* ── Quick switcher modal ── */}
      {switcherOpen && (
        <QuickSwitcher
          conversations={conversations}
          placeholder={t('quickSwitcherPlaceholder')}
          recentLabel={t('recentConversations')}
          emptyLabel={emptyLabel}
          onClose={() => setSwitcherOpen(false)}
        />
      )}

      {groupOpen && <CreateGroupModal onClose={() => setGroupOpen(false)} />}
    </div>
  );
}

/* ── Single conversation row ── */
function ConversationRow({
  conv, active, unread, typing, onHide, onTogglePin, onToggleMute,
}: {
  conv: Conversation; active: boolean; unread: boolean; typing: string[];
  onHide: () => void; onTogglePin: () => void; onToggleMute: () => void;
}) {
  const tMessages   = useT('messages');
  const router      = useRouter();
  const tHide       = tMessages('hideConversation');
  const isGroup     = !!conv.isGroup;
  const live        = usePresence(conv.otherUser.id, conv.otherUser.status, conv.otherUser.last_seen);
  const displayName = isGroup
    ? (conv.groupName?.trim() || tMessages('unnamedGroup'))
    // A 1:1 whose other participant is missing (left/deleted) can have null
    // name AND username — fall back so `displayName[0]` never hits null.
    : (conv.otherUser.display_name ?? conv.otherUser.username ?? tMessages('unknownUser'));
  const initial     = displayName[0]?.toUpperCase() ?? '?';
  const routeId     = conv.routeId ?? conv.otherUser.public_id ?? '';

  function handleHideClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onHide();
  }

  const avatarNode = isGroup ? (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-link/25">
      {conv.groupAvatar
        ? <Image src={conv.groupAvatar} alt={displayName} fill sizes="36px" className="object-cover" />
        : <span className="flex h-full w-full items-center justify-center text-link"><Users className="h-[18px] w-[18px]" /></span>}
    </div>
  ) : (
    <AvatarWithStatus
      status={live.status}
      lastSeen={live.last_seen}
      size={36}
      dotSize={9}
    >
      {conv.otherUser.avatar_url ? (
        <AvatarImage src={conv.otherUser.avatar_url} alt={displayName} sizes="36px" className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm font-bold text-link">{initial}</span>
      )}
    </AvatarWithStatus>
  );

  const body = (
    <>
      {avatarNode}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className={cn('truncate text-[14px] leading-tight', unread ? 'font-bold text-foreground' : 'font-medium', !isGroup && conv.otherUser.is_premium && 'aurora-text aurora-text-glow')}>
            {isGroup ? displayName : <EmojiText content={displayName} clamp />}
          </span>
          {!isGroup && conv.otherUser.is_bot && <BotBadge size="sm" />}
          {!isGroup && conv.otherUser.is_verified && <VerifiedBadge size="sm" />}
          {!isGroup && conv.otherUser.is_moderator && <ModeratorBadge size="sm" />}
          {!isGroup && conv.otherUser.is_premium && <PremiumBadge size="sm" />}
          {!isGroup && <DeviceBadge userId={conv.otherUser.id} collapse />}
          {conv.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-link" />}
          {conv.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-warning" />}
        </div>
        <p className="truncate text-[12px] text-muted-foreground/60">
          {typing.length > 0 ? (
            <span className="flex items-center gap-1.5 text-link">
              <span className="flex items-center gap-0.5">
                <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
                <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
                <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
              </span>
              <span className="truncate font-medium">
                {typing.length > 1
                  ? tMessages('severalTyping')
                  : (isGroup && typing[0] ? <>{renderEmojiNodes(typing[0])} {tMessages('typing')}</> : tMessages('typing'))}
              </span>
            </span>
          ) : isGroup ? (
            <>{conv.memberCount ?? 0} {tMessages('membersCount')}</>
          ) : conv.otherUser.custom_status?.trim() ? (
            <>{renderEmojiNodes(conv.otherUser.custom_status.trim())}</>
          ) : (
            <>@{conv.otherUser.username}</>
          )}
        </p>
      </div>
    </>
  );

  return (
    <Link
      href={`/messages/${routeId}`}
      // Warm the full conversation route (RSC + data) on hover/focus so the
      // click opens instantly with no skeleton — Discord-style. Default Link
      // prefetch only fetches the loading state for dynamic routes; an explicit
      // router.prefetch pulls the data too. Next dedupes within its cache window,
      // so repeated hovers are cheap. Safe now that the route no longer marks
      // the conversation read server-side.
      onPointerEnter={() => routeId && router.prefetch(`/messages/${routeId}`)}
      onFocus={() => routeId && router.prefetch(`/messages/${routeId}`)}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-fast md:py-2',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
      )}
    >
      {isGroup ? (
        <GroupContextMenu
          group={{ conversationId: conv.id, publicId: routeId, name: conv.groupName ?? null, avatar: conv.groupAvatar ?? null }}
        >
          {body}
        </GroupContextMenu>
      ) : (
        <UserContextMenu
          user={conv.otherUser}
          conversationId={conv.id}
          popoutPath={`/messages/${routeId}`}
          pinned={conv.pinned}
          muted={conv.muted}
          onCloseDm={onHide}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
        >
          {body}
        </UserContextMenu>
      )}

      {/* Unread dot */}
      {unread && !active && (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-link group-hover:hidden" />
      )}

      {/* Hide (X) — shown on hover */}
      <button
        type="button"
        onClick={handleHideClick}
        title={tHide}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive group-hover:flex"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </Link>
  );
}

/* ── Discord-style quick switcher modal ── */
function QuickSwitcher({
  conversations, placeholder, recentLabel, emptyLabel, onClose,
}: {
  conversations: Conversation[];
  placeholder: string;
  recentLabel: string;
  emptyLabel: string;
  onClose: () => void;
}) {
  const tMessages = useT('messages');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = query.trim()
    ? conversations.filter(c => {
        const q    = query.toLowerCase();
        // Groups (and missing participants) can have null name/username here.
        const name = (c.otherUser.display_name ?? c.otherUser.username ?? '').toLowerCase();
        const uname = (c.otherUser.username ?? '').toLowerCase();
        return name.includes(q) || uname.includes(q);
      })
    : conversations;

  function go(id: string) {
    router.push(`/messages/${id}`);
    onClose();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg bg-background/60 px-4 py-3 text-[18px] text-foreground placeholder:text-muted-foreground/50 outline-none"
          />
        </div>

        <div className="max-h-[340px] overflow-y-auto px-2 pb-3">
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">
            {recentLabel}
          </p>

          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground/50">{emptyLabel}</p>
          )}

          {filtered.map(conv => {
            const displayName = conv.otherUser.display_name ?? conv.otherUser.username ?? tMessages('unknownUser');
            const initial     = displayName[0]?.toUpperCase() ?? '?';
            return (
              <button
                key={conv.id}
                onClick={() => go(conv.otherUser.public_id ?? '')}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/60"
              >
                <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-link/20">
                  {conv.otherUser.avatar_url ? (
                    <AvatarImage src={conv.otherUser.avatar_url} alt={displayName} sizes="28px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{initial}</span>
                  )}
                </div>
                <EmojiText content={displayName} clamp className={cn('truncate text-[15px] font-medium', conv.otherUser.is_premium && 'aurora-text aurora-text-glow')} />
                {conv.otherUser.is_bot && <BotBadge size="sm" />}
                {conv.otherUser.is_verified && <VerifiedBadge size="sm" />}
                {conv.otherUser.is_moderator && <ModeratorBadge size="sm" />}
                {conv.otherUser.is_premium && <PremiumBadge size="sm" />}
                <span className="truncate text-[13px] text-muted-foreground/50">@{conv.otherUser.username}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
