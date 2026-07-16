'use client';

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { Smile } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { twemojiUrl } from '@/lib/utils/twemoji';
import { useT } from '@/providers/i18n-provider';
import { EmojiPicker, loadMart, emojiName } from './emoji-picker';
import { getEmojiById, getEmojiByName, fetchEmojiById, subscribeEmojis, getEmojiVersion } from '@/lib/emoji';
import { Tooltip } from './tooltip';

// useLayoutEffect on the client (before paint → no flash), useEffect on the server.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface ReactionGroup {
  emoji: string;
  count: number;
  reacted: boolean;
}

/** A custom server-emoji reaction token: `<:name:payload>` / `<a:name:payload>`,
 *  where payload is the short public_id (preferred) or a legacy image url. */
const CUSTOM_EMOJI_RE = /^<(a)?:([a-z0-9_]{2,32}):([^\s>]+)>$/i;

/**
 * Render a single reaction glyph. Custom server emojis render their image —
 * resolving the id-based token via the emoji registry (fetching on demand for
 * emojis from servers the viewer isn't in), or using a legacy url payload
 * directly. Unicode emojis render as Twemoji for a consistent look with the
 * rest of the app (picker, messages, posts).
 */
function ReactionEmoji({ token, className }: { token: string; className?: string }) {
  const custom = token.match(CUSTOM_EMOJI_RE);
  const isCustom = !!custom;
  const emojiShort = custom?.[2] ?? '';
  const payload = custom?.[3] ?? '';
  const isUrl = /^https?:\/\//i.test(payload);
  // Re-render when the registry loads (getServerSnapshot 0 → hydration-safe).
  const version = useSyncExternalStore(subscribeEmojis, getEmojiVersion, () => 0);
  const [url, setUrl] = useState<string | null>(isUrl ? payload : null);

  // Resolve from the registry before paint; re-run when it gains emojis.
  useIsoLayoutEffect(() => {
    if (!isCustom || isUrl) return;
    const cached = getEmojiById(payload) ?? getEmojiByName(emojiShort);
    if (cached) setUrl(cached.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustom, isUrl, payload, emojiShort, version]);

  useEffect(() => {
    if (!isCustom || isUrl || url || !payload) return;
    if (getEmojiById(payload) ?? getEmojiByName(emojiShort)) return;
    let cancelled = false;
    void fetchEmojiById(payload).then((e) => { if (!cancelled && e) setUrl(e.url); });
    return () => { cancelled = true; };
  }, [isCustom, isUrl, payload, url, emojiShort]);

  if (isCustom) {
    const alt = `:${emojiShort}:`;
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} decoding="async" draggable={false} className={cn('inline-block object-contain', className)} />
    ) : (
      <span className={cn('inline-flex items-center justify-center text-[10px] text-muted-foreground/70', className)}>{alt}</span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={twemojiUrl(token)} alt={token} decoding="async" draggable={false} className={cn('inline-block object-contain', className)} />
  );
}

/** `:name:` label shown on hover, mirroring the emoji picker's tooltips. */
function reactionName(token: string): string {
  const custom = token.match(CUSTOM_EMOJI_RE);
  if (custom) return `:${custom[2]}:`;
  const name = emojiName(token);
  return name ? `:${name}:` : token;
}

interface ReactionBarProps {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
  canReact?: boolean;
  /** Render the inline "add reaction" button (opens the full emoji picker). */
  showAdd?: boolean;
  /** Active server — its custom emojis are force-refreshed when the picker opens. */
  serverId?: string;
  className?: string;
}

export function ReactionBar({
  reactions,
  onToggle,
  canReact = true,
  showAdd = true,
  serverId,
  className,
}: ReactionBarProps) {
  const t = useT('reactions');

  // Make sure the emoji dataset is loaded so hover tooltips can resolve names.
  // Cheap: loadMart() is a no-op once cached; this re-renders at most once.
  const [, force] = useState(0);
  useEffect(() => {
    let active = true;
    loadMart().then(() => { if (active) force((n) => n + 1); });
    return () => { active = false; };
  }, []);

  // Nothing to show: no reactions and no way (or intent) to add one.
  if (reactions.length === 0 && (!canReact || !showAdd)) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {reactions.map((r) => (
        <Tooltip
          key={r.emoji}
          side="top"
          content={<span className="font-normal normal-case tracking-normal">{reactionName(r.emoji)}</span>}
        >
          <button
            type="button"
            onClick={() => canReact && onToggle(r.emoji)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] transition-colors',
              r.reacted
                ? 'border-link/50 bg-link/10 text-link hover:bg-link/20'
                : 'border-border/50 bg-background/40 text-foreground hover:border-link/30 hover:bg-link/5',
              !canReact && 'cursor-default',
            )}
          >
            <ReactionEmoji token={r.emoji} className="h-[18px] w-[18px]" />
            <span className="min-w-[10px] text-[11px] font-medium tabular-nums">{r.count}</span>
          </button>
        </Tooltip>
      ))}

      {canReact && showAdd && (
        <EmojiPicker
          onSelect={onToggle}
          serverId={serverId}
          title={t('add')}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border/40 text-muted-foreground/60 transition-colors hover:border-link/30 hover:bg-link/5 hover:text-link"
        >
          <Smile className="h-3.5 w-3.5" />
        </EmojiPicker>
      )}
    </div>
  );
}
