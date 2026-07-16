'use client';

import { useMemo, useState } from 'react';
import { Reply, X, Paperclip, Smile, Timer, AtSign, Send } from 'lucide-react';
import { Sticker as StickerIcon } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { AvatarImage } from '@/components/ui/avatar-image';
import { MAX_CHAT_IMAGES, uploadLimitMb } from '@/lib/utils/media';
import {
  EmojiPicker,
  EmojiInput,
  type EmojiInputHandle,
  GifPicker,
  AttachMenu,
  FormattingHelp,
  useSlashCommands,
  renderEmojiNodes,
} from '@/components/ui';
import { Slash } from 'lucide-react';
import { useT } from '@/providers/i18n-provider';
import { RateLimitPopup } from '@/lib/rate-limit';
import { AttachmentTray, type PendingFile } from '@/features/media';
import { StickerPicker, stickerContent } from '@/features/stickers';
import type { ChannelMessage } from './use-channel-messages';

interface Member {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
}

export interface MessageComposerProps {
  channelId: string;
  channelName: string;
  myId: string;
  myName: string;
  isPremium?: boolean;
  canSend: boolean;
  canGif: boolean;
  canEmoji: boolean;
  timedOut: boolean;
  timeoutUntilMs: number;
  nowTs: number;
  myTimeoutReason?: string | null;
  serverId?: string;
  members: Member[];
  replyTo: ChannelMessage | null;
  blockedFor: number;
  attItems: PendingFile[];
  attWarning: 'size' | 'count' | null;
  charCount: number;
  setCharCount: (n: number) => void;
  textRef: React.RefObject<EmojiInputHandle | null>;
  imgInputRef: React.RefObject<HTMLInputElement | null>;
  onAddFiles: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  onToggleSpoiler: (id: string) => void;
  onRenameAttachment: (id: string, name: string) => void;
  onSend: () => void;
  onSendContent: (content: string, replyId: string | null) => void;
  onSetReplyTo: (msg: ChannelMessage | null) => void;
  /** Called after input change so parent can sync draft + broadcast typing. */
  onInputChange: () => void;
  onClearBlock: () => void;
  onTakeAttachments: () => PendingFile[];
}

/**
 * The channel message composer: reply preview, @-mention autocomplete,
 * attachment tray, input row, timeout/no-permission banners.
 * All state that doesn't need to leave this subtree lives here.
 */
export function MessageComposer({
  channelId,
  channelName,
  myId,
  myName,
  isPremium,
  canSend,
  canGif,
  canEmoji,
  timedOut,
  timeoutUntilMs,
  nowTs,
  myTimeoutReason,
  serverId,
  members,
  replyTo,
  blockedFor,
  attItems,
  attWarning,
  charCount,
  setCharCount,
  textRef,
  imgInputRef,
  onAddFiles,
  onRemoveAttachment,
  onToggleSpoiler,
  onRenameAttachment,
  onSend,
  onSendContent,
  onSetReplyTo,
  onInputChange,
  onClearBlock,
}: MessageComposerProps) {
  const tm = useT('messages');
  const ts = useT('servers');
  const msgLimit = isPremium ? 4000 : 2000;

  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);

  const slash = useSlashCommands({
    scope: 'channel',
    channelId,
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

  const mentionItems = useMemo(() => {
    type Item = { id: string; insert: string; label: string; sub: string; avatar?: string | null; special?: boolean };
    if (!mention) return [] as Item[];
    const q = mention.query.toLowerCase();
    const out: Item[] = [];
    if ('everyone'.startsWith(q))
      out.push({ id: 'everyone', insert: 'everyone', label: '@everyone', sub: tm('mentionEveryone'), special: true });
    if ('here'.startsWith(q))
      out.push({ id: 'here', insert: 'here', label: '@here', sub: tm('mentionHere'), special: true });
    members.forEach((mm) => {
      if (mm.id === myId) return;
      const dn = mm.display_name ?? mm.username;
      if (mm.username.toLowerCase().includes(q) || dn.toLowerCase().includes(q)) {
        out.push({ id: mm.id, insert: mm.username, label: dn, sub: `@${mm.username}`, avatar: mm.avatar_url });
      }
    });
    return out.slice(0, 8);
  }, [mention, members, myId, tm]);

  function detectMention(el: EmojiInputHandle) {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const mm = before.match(/(?:^|\s)@([a-z0-9_]*)$/i);
    if (mm) {
      setMention({ query: mm[1] ?? '', start: caret - (mm[1]?.length ?? 0) - 1 });
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

  function insertEmoji(emoji: string) {
    textRef.current?.insertAtCaret(emoji);
  }

  function handleInput() {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    setCharCount(el.value.length);
    slash.detect(el);
    if (!slash.active) detectMention(el);
    onInputChange();
  }

  /** Send button / Enter: if the field is a slash command, run it instead. */
  async function trySend() {
    if (await slash.maybeSubmit()) return;
    onSend();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Slash-command picker owns navigation keys while it's open.
    if (slash.onKeyDown(e)) return;
    if (mention && mentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(mentionItems[mentionIdx] ?? mentionItems[0]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void trySend();
    }
  }

  function fmtRemaining(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts: string[] = [];
    if (d) parts.push(`${d}${ts('unitShortD')}`);
    if (h) parts.push(`${h}${ts('unitShortH')}`);
    if (m) parts.push(`${m}${ts('unitShortM')}`);
    if (!d && !h) parts.push(`${s}${ts('unitShortS')}`);
    return parts.slice(0, 2).join(' ') || `0${ts('unitShortS')}`;
  }

  return (
    <div className="relative z-10 px-4 pb-4">
      {blockedFor > 0 && <RateLimitPopup durationMs={blockedFor} onDismiss={onClearBlock} />}

      {/* Reply preview */}
      {replyTo && (
        <div className="mb-1 flex items-center gap-2 rounded-t-lg bg-accent/40 px-3 py-1.5 text-[13px]">
          <Reply className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            {tm('replyingTo')}{' '}
            <span className="font-semibold text-foreground/80">
              {renderEmojiNodes(
                replyTo.sender_id === myId
                  ? myName
                  : (replyTo.sender?.display_name ?? replyTo.sender?.username ?? '?'),
              )}
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground/60">{replyTo.content}</span>
          <button
            type="button"
            onClick={() => onSetReplyTo(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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

      {/* Attachment tray */}
      <AttachmentTray
        items={attItems}
        onRemove={onRemoveAttachment}
        onToggleSpoiler={onToggleSpoiler}
        onRename={onRenameAttachment}
        warningText={
          attWarning === 'size'
            ? tm('fileTooLarge', { mb: uploadLimitMb(isPremium) })
            : attWarning === 'count'
              ? tm('imagesMax', { max: MAX_CHAT_IMAGES })
              : undefined
        }
        removeLabel={tm('removeImage')}
      />

      {canSend ? (
        <div className="flex items-center gap-3 rounded-xl bg-accent/60 px-3.5 py-2.5">
          {canGif && (
            <>
              <AttachMenu
                title={tm('attach')}
                items={[
                  {
                    icon: <Paperclip className="h-[18px] w-[18px]" />,
                    label: tm('uploadFile'),
                    onClick: () => imgInputRef.current?.click(),
                  },
                ]}
              />
              <input
                ref={imgInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) onAddFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )}
          <EmojiInput
            ref={textRef}
            maxLength={msgLimit}
            onKeyDown={onKeyDown}
            onInput={handleInput}
            onPaste={(e) => {
              const files = e.clipboardData?.files;
              if (files && Array.from(files).some((f) => f.size > 0)) {
                e.preventDefault();
                onAddFiles(files);
              }
            }}
            placeholder={tm('messagePlaceholder', { name: `#${channelName}` })}
            className="max-h-[160px] flex-1 overflow-y-auto bg-transparent py-1 text-[15px] leading-relaxed text-foreground outline-none"
          />
          {charCount >= msgLimit - 200 && (
            <span
              className={cn(
                'shrink-0 text-[11px] font-medium tabular-nums',
                charCount >= msgLimit ? 'text-destructive' : 'text-muted-foreground/60',
              )}
            >
              {charCount}/{msgLimit}
            </span>
          )}
          {canGif && (
            <GifPicker onSelect={(url) => onSendContent(url, null)}>
              <span
                title={tm('gif')}
                className="flex h-9 shrink-0 items-center justify-center rounded-md px-2 text-[11px] font-bold text-muted-foreground ring-1 ring-muted-foreground/40 transition-colors hover:text-foreground hover:ring-foreground/60 md:h-7 md:px-1.5"
              >
                GIF
              </span>
            </GifPicker>
          )}
          {canEmoji && (
            <StickerPicker onSelect={(id) => onSendContent(stickerContent(id), null)}>
              <span
                title={tm('stickers')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground md:h-7 md:w-7"
              >
                <StickerIcon className="h-5 w-5" />
              </span>
            </StickerPicker>
          )}
          {canEmoji && (
            <EmojiPicker onSelect={insertEmoji} serverId={serverId}>
              <span
                title={tm('emoji')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground md:h-7 md:w-7"
              >
                <Smile className="h-5 w-5" />
              </span>
            </EmojiPicker>
          )}
          {/* Slash commands — type "/" or tap to invoke bots present here. */}
          <button
            type="button"
            title={tm('slashCommands')}
            onClick={slash.trigger}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground md:h-7 md:w-7"
          >
            <Slash className="h-5 w-5" />
          </button>
          <span className="hidden md:inline"><FormattingHelp /></span>

          {/* Send — always-visible tappable button (Enter still works). */}
          {charCount > 0 && (
            <button
              type="button"
              onClick={() => void trySend()}
              aria-label={tm('send')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-link text-white transition-transform active:scale-90 md:h-8 md:w-8"
            >
              <Send className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      ) : timedOut ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[13px]">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <Timer className="h-4 w-4 shrink-0" /> {ts('timedOutTitle')}
          </p>
          {myTimeoutReason && (
            <p className="mt-1 text-muted-foreground">
              <span className="text-foreground/70">{ts('timedOutReason')}:</span> {myTimeoutReason}
            </p>
          )}
          <p className="mt-0.5 text-muted-foreground">
            {ts('timedOutRemaining', { time: fmtRemaining(timeoutUntilMs - nowTs) })}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-accent/40 px-4 py-3 text-center text-[13px] text-muted-foreground">
          {ts('noSendPermission')}
        </div>
      )}
    </div>
  );
}
