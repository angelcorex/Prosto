'use client';

import { useRef, useState } from 'react';
import { Reply } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { attachmentsOf, isStorageUrl, type ChatAttachment } from '@/lib/utils/media';
import {
  VerifiedBadge,
  ModeratorBadge,
  PremiumBadge,
  BotBadge,
  MiniProfilePopup,
  ChatGif,
  ChatAlbum,
  ChatMedia,
  MessageText,
  LinkPreview,
  renderEmojiNodes,
} from '@/components/ui';
import { AvatarImage } from '@/components/ui/avatar-image';
import { ReactionBar, type ReactionGroup } from '@/components/ui/reaction-bar';
import { DeviceBadge } from '@/features/presence';
import { Sticker, stickerOf } from '@/features/stickers';
import { ServerInviteEmbed } from '../invites/invite-embed';
import { inviteTokenOf } from '../invites/invite-link';
import { roleNameStyle, roleNameClass } from '../roles/permissions';
import { MessageActions } from './message-actions';
import type { ChannelMessage, Sender } from './use-channel-messages';

// Re-export so callers don't need to import from two places.
export type { ChannelMessage, Sender };

interface EditState {
  editingId: string | null;
  editRef: React.RefObject<HTMLTextAreaElement | null>;
  msgLimit: number;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
}

interface MessageItemProps {
  msg: ChannelMessage;
  prev: ChannelMessage | undefined;
  /** Full message list — used to resolve the replied-to message. */
  allMessages: ChannelMessage[];
  myId: string;
  myName: string;
  myProfile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    is_verified?: boolean;
    is_moderator?: boolean;
    is_premium?: boolean;
  } | null;
  locale: string;
  canManageMessages: boolean;
  canGif: boolean;
  canReact: boolean;
  isOwner: boolean;
  serverId?: string;
  reactions: Map<string, ReactionGroup[]>;
  favGifs: Set<string>;
  editState: EditState;
  onContextMenu: (e: React.MouseEvent, msg: ChannelMessage, isMine: boolean, editable: boolean) => void;
  onReply: (msg: ChannelMessage) => void;
  onForward: (msg: ChannelMessage) => void;
  onCopy: (text: string) => void;
  onStartEdit: (id: string) => void;
  onPin: (id: string) => void;
  onCopyId: (id: string) => void;
  onDelete: (id: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onToggleFavGif: (url: string) => void;
  onOpenImage: (src: string, authorName: string, authorAvatar: string | null | undefined, subtitle: string) => void;
  /** Jump/scroll to a message by id (used by the clickable reply quote). */
  onJumpTo?: (id: string) => void;
  /** Localised label for "theme changed" system message. */
  sysThemeChangedLabel: string;
  /** Localised label for "pinned a message" system message. */
  sysPinnedLabel: string;
  /** Localised labels for GIF favourite buttons. */
  gifFavTitle: string;
  gifAddFavTitle: string;
  /** Localised "Failed to send" string. */
  sendFailedLabel: string;
  /** Localised edit hint string. */
  editHintLabel: string;
  /** Localised "(edited)" marker. */
  editedLabel: string;
}

export function MessageItem({
  msg,
  prev,
  allMessages,
  myId,
  myName,
  myProfile,
  locale,
  canManageMessages,
  canGif,
  canReact,
  isOwner,
  serverId,
  reactions,
  favGifs,
  editState,
  onContextMenu,
  onReply,
  onForward,
  onCopy,
  onStartEdit,
  onPin,
  onCopyId,
  onDelete,
  onReact,
  onToggleFavGif,
  onOpenImage,
  onJumpTo,
  sysThemeChangedLabel,
  sysPinnedLabel,
  gifFavTitle,
  gifAddFavTitle,
  sendFailedLabel,
  editHintLabel,
  editedLabel,
}: MessageItemProps) {
  // Touch reveal for the action toolbar (no hover on touch — tap the bubble).
  const [actionsOpen, setActionsOpen] = useState(false);
  const isMine = msg.sender_id === myId;
  const name = isMine
    ? myName
    : (msg.sender?.display_name ?? msg.sender?.username ?? '?');
  const initial = name[0]?.toUpperCase() ?? '?';
  const avatar = isMine ? myProfile?.avatar_url : msg.sender?.avatar_url;
  const verified = isMine ? myProfile?.is_verified : msg.sender?.is_verified;
  const moderator = isMine ? myProfile?.is_moderator : msg.sender?.is_moderator;
  const premium = isMine ? myProfile?.is_premium : msg.sender?.is_premium;
  // Own messages are never a bot; a peer's message can be. (My own profile has
  // no is_bot field — a human is never editing as their own bot here.)
  const isBot = !isMine && !!msg.sender?.is_bot;
  // Aurora name for premium users — but a role GRADIENT wins on servers.
  const premiumName = !!premium && !msg.sender?.role_color2;
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(msg.created_at),
  );
  const popupUser = {
    username: msg.sender?.username ?? (isMine ? myProfile?.username ?? '' : ''),
  };

  const repliedMsg = msg.reply_to
    ? allMessages.find((x) => x.id === msg.reply_to) ?? null
    : null;

  // Computed flags
  const isPing = !isMine && !!repliedMsg && repliedMsg.sender_id === myId;
  const mentionsMe =
    /@(everyone|here)([^a-z0-9_]|$)/i.test(msg.content) ||
    (!isMine &&
      !!myProfile?.username &&
      new RegExp(`@${myProfile.username}([^a-z0-9_]|$)`, 'i').test(msg.content));
  const sticker = stickerOf(msg.content);
  const atts: ChatAttachment[] | null =
    msg.uploading && msg.attachments?.length
      ? msg.attachments
      : !sticker && canGif
        ? attachmentsOf(msg.content)
        : null;
  const allImages = !!atts && atts.every((a) => a.kind === 'image');
  // Spoilered media routes through ChatMedia (per-item blur); the album/single
  // image fast-paths can't blur individual tiles.
  const anySpoiler = !!atts && atts.some((a) => a.spoiler);
  const albumUrls = atts && allImages && !anySpoiler && atts.length > 1 ? atts.map((a) => a.url) : null;
  const singleImg = atts && allImages && !anySpoiler && atts.length === 1 ? atts[0]!.url : null;
  const mediaAtts = atts && (!allImages || anySpoiler) ? atts : null;
  const hasImages = !!atts;
  const isSystem = msg.content === 'sys:theme' || msg.content === 'sys:pin';
  const inviteToken = !sticker && !hasImages ? inviteTokenOf(msg.content) : null;
  const editable = isMine && !sticker && !hasImages;
  const canDelete = isMine || canManageMessages;

  // Discord-style grouping: consecutive same-author messages within 7 min
  // drop the avatar/name header. Replies always start a fresh group.
  // A system line (sys:pin / sys:theme) breaks the block: the next real message
  // must start fresh with its avatar + name, not group under the system line.
  const prevIsSystem = prev?.content === 'sys:theme' || prev?.content === 'sys:pin';
  const grouped =
    !!prev &&
    !prevIsSystem &&
    !msg.reply_to &&
    prev.sender_id === msg.sender_id &&
    new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 7 * 60 * 1000;

  if (isSystem) {
    // A 'sys:pin' line jumps to the pin it announced: the newest pinned message
    // at/just before this line's time (Telegram-style — click the event).
    const pinTarget = msg.content === 'sys:pin'
      ? allMessages
          .filter((m) => m.pinned_at && new Date(m.pinned_at).getTime() <= new Date(msg.created_at).getTime() + 2000)
          .sort((a, b) => new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime())[0] ?? null
      : null;
    const label = (
      <span className="rounded-full bg-background/50 px-3 py-1 text-[12px] text-muted-foreground backdrop-blur-sm">
        <span className="font-medium text-foreground/80">{renderEmojiNodes(name)}</span>{' '}
        {msg.content === 'sys:pin' ? sysPinnedLabel : sysThemeChangedLabel}
      </span>
    );
    return (
      <div key={msg.id} className="relative z-10 my-2 flex items-center justify-center px-4">
        {pinTarget ? (
          <button type="button" onClick={() => onJumpTo?.(pinTarget.id)} className="transition-opacity hover:opacity-80">
            {label}
          </button>
        ) : label}
      </div>
    );
  }

  const msgReactions = reactions.get(msg.id);

  const body = (
    <>
      {sticker ? (
        <Sticker url={sticker} pending={msg.pending} />
      ) : albumUrls ? (
        <ChatAlbum
          urls={albumUrls}
          pending={msg.pending}
          uploading={msg.uploading}
          onOpen={(u) => onOpenImage(u, name, avatar, time)}
        />
      ) : singleImg ? (
        <ChatGif
          src={singleImg}
          pending={msg.pending}
          uploading={msg.uploading}
          isFavorite={favGifs.has(singleImg)}
          onToggleFavorite={
            msg.uploading || isStorageUrl(singleImg) ? undefined : () => onToggleFavGif(singleImg)
          }
          favTitle={gifFavTitle}
          addFavTitle={gifAddFavTitle}
          onOpen={() => onOpenImage(singleImg, name, avatar, time)}
        />
      ) : mediaAtts ? (
        <ChatMedia
          attachments={mediaAtts}
          uploading={msg.uploading}
          onOpen={(u) => onOpenImage(u, name, avatar, time)}
        />
      ) : editState.editingId === msg.id ? (
        <div className="mt-0.5">
          <textarea
            ref={editState.editRef}
            defaultValue={msg.content}
            rows={1}
            maxLength={editState.msgLimit}
            autoFocus
            onFocus={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${el.scrollHeight}px`;
              el.setSelectionRange(el.value.length, el.value.length);
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                editState.onSaveEdit(msg.id);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                editState.onCancelEdit();
              }
            }}
            className="w-full resize-none rounded-lg bg-accent/60 px-3 py-2 text-[15px] leading-relaxed text-foreground outline-none ring-1 ring-border/40"
          />
          <p className="mt-1 text-[11px] text-muted-foreground/60">{editHintLabel}</p>
        </div>
      ) : (
        <MessageText
          content={msg.content}
          className={cn(
            msg.pending && 'text-muted-foreground/50',
            msg.failed && 'text-destructive/70',
          )}
          suffix={msg.edited_at ? <span className="ml-1 align-baseline text-[11px] text-muted-foreground/40">{editedLabel}</span> : null}
        />
      )}
      {msg.failed && (
        <p className="mt-0.5 text-[11px] text-destructive">{sendFailedLabel}</p>
      )}
      {inviteToken && <ServerInviteEmbed token={inviteToken} />}
      {/* Link preview — plain text messages only (skip stickers, media, invites). */}
      {!sticker && !hasImages && !inviteToken && <LinkPreview content={msg.content} />}
    </>
  );

  return (
    <div
      className={cn(
        'group relative rounded px-2 hover:bg-white/[0.02]',
        actionsOpen && 'z-10',
        grouped ? 'py-1' : 'mt-[17px] py-1 first:mt-0',
        isPing && 'border-l-2 border-link bg-link/[0.06]',
        mentionsMe && 'border-l-2 border-warning bg-warning/[0.08]',
      )}
      onClick={(e) => {
        // Touch has no hover — a tap on the bubble reveals the action toolbar.
        if (window.matchMedia('(hover: hover)').matches) return;
        if (msg.id.startsWith('opt-')) return;
        const target = e.target as HTMLElement;
        if (target.closest('a, button, img, video, [role="button"], input, textarea, [contenteditable]')) return;
        setActionsOpen((v) => !v);
      }}
      onContextMenu={(e) => {
        if (msg.id.startsWith('opt-')) return;
        e.preventDefault();
        onContextMenu(e, msg, isMine, editable);
      }}
    >
      <MessageActions
        canDelete={canDelete}
        canEdit={editable}
        canReact={canReact}
        canPin={canManageMessages}
        isPinned={!!msg.pinned_at}
        serverId={serverId}
        forceOpen={actionsOpen}
        onReply={() => onReply(msg)}
        onForward={() => onForward(msg)}
        onCopy={() => onCopy(msg.content)}
        onCopyId={() => onCopyId(msg.id)}
        onEdit={() => onStartEdit(msg.id)}
        onPin={() => onPin(msg.id)}
        onDelete={() => onDelete(msg.id)}
        onReact={(emoji) => onReact(msg.id, emoji)}
      />

      {!grouped && repliedMsg && (
        <button
          type="button"
          onClick={() => onJumpTo?.(repliedMsg.id)}
          className="mb-0.5 flex w-fit max-w-full items-center gap-1.5 pl-[52px] text-left text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <Reply className="h-3 w-3 shrink-0" />
          <span className="font-medium">
            {renderEmojiNodes(
              repliedMsg.sender_id === myId
                ? myName
                : (repliedMsg.sender?.display_name ?? repliedMsg.sender?.username ?? '?'),
            )}
          </span>
          <span className="truncate opacity-70">{repliedMsg.content}</span>
        </button>
      )}

      {grouped ? (
        <div className="flex">
          <span className="w-[52px] shrink-0 select-none whitespace-nowrap pr-2 pt-[3px] text-right text-[10px] leading-[18px] text-muted-foreground/40 opacity-0 group-hover:opacity-100">
            {time}
          </span>
          <div className="min-w-0 flex-1">
            {body}
            {msgReactions && msgReactions.length > 0 && (
              <ReactionBar
                reactions={msgReactions}
                onToggle={(e) => onReact(msg.id, e)}
                canReact={canReact}
                serverId={serverId}
                className="mt-1"
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <MiniProfilePopup user={popupUser}>
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-link/20">
              {avatar ? (
                <AvatarImage src={avatar} alt={name} sizes="40px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-bold text-link">
                  {initial}
                </span>
              )}
            </div>
          </MiniProfilePopup>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1.5">
              <MiniProfilePopup user={popupUser}>
                <span
                  className={cn(
                    'text-[14px] font-semibold leading-tight hover:underline',
                    premiumName
                      ? 'aurora-text aurora-text-glow'
                      : roleNameClass(msg.sender?.role_color, msg.sender?.role_color2),
                  )}
                  style={
                    premiumName
                      ? undefined
                      : roleNameStyle(
                          msg.sender?.role_color,
                          msg.sender?.role_color2,
                          msg.sender?.role_glow,
                        )
                  }
                >
                  {renderEmojiNodes(name)}
                </span>
              </MiniProfilePopup>
              {msg.sender?.role_icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.sender.role_icon}
                  alt=""
                  className="h-[18px] w-[18px] shrink-0 object-contain"
                />
              )}
              {isBot && <BotBadge size="sm" />}
              {verified && <VerifiedBadge size="sm" />}
              {moderator && <ModeratorBadge size="sm" />}
              {premium && <PremiumBadge size="sm" />}
              {!isBot && <DeviceBadge userId={msg.sender_id} />}
              <span className="text-[11px] text-muted-foreground/50">{time}</span>
            </div>
            {body}
            {msgReactions && msgReactions.length > 0 && (
              <ReactionBar
                reactions={msgReactions}
                onToggle={(e) => onReact(msg.id, e)}
                canReact={canReact}
                serverId={serverId}
                className="mt-1"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
