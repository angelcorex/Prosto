'use client';

import { Fragment, useCallback, useState, type ReactNode } from 'react';
import { FileText, Download, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { formatBytes, type ChatAttachment } from '@/lib/utils/media';
import { useT } from '@/providers/i18n-provider';

import { VideoPlayer } from './video-player';

/**
 * Wraps a spoiler attachment: the media stays mounted but is hidden behind a
 * frosted-glass overlay with a "Spoiler" affordance until the viewer clicks to
 * reveal it (NSFW / spoiler content).
 */
function SpoilerShell({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <>{children}</>;
  return (
    <div className={cn('relative overflow-hidden rounded-xl', full ? 'block w-full' : 'inline-flex')}>
      {/* The real media is kept `invisible` (visibility:hidden) so it reserves
          the correct size but is NEVER painted — no first-frame flash, no
          peeking through a translucent blur. A fully opaque cover sits on top,
          so nothing of the content is ever visible until the viewer reveals it. */}
      <div className="pointer-events-none invisible select-none">{children}</div>
      <button
        type="button"
        onClick={() => setRevealed(true)}
        aria-label={label}
        className="absolute inset-0 flex items-center justify-center bg-secondary transition-colors hover:bg-secondary/80"
      >
        <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white">
          <EyeOff className="h-4 w-4" />{label}
        </span>
      </button>
    </div>
  );
}

/**
 * A single chat image. First-ever load fades in over a placeholder box (no
 * pop-in flash). On re-navigation the browser already has it cached, so we
 * detect `complete` synchronously on mount and show it instantly — no fade, no
 * flicker back to the skeleton.
 */
function MediaImage({ src, loading, onOpen, full }: { src: string; loading: string; onOpen: () => void; full?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  // Ref callback runs on mount: a cached image is already `complete`, so we
  // skip the opacity-0 → 1 fade that otherwise flashes on every revisit.
  const captureIfCached = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open image"
      className={cn(
        'block cursor-zoom-in overflow-hidden rounded-lg',
        full && 'w-full',
        !loaded && !loading && (full ? 'min-h-[220px] w-full animate-skeleton' : 'min-h-[120px] min-w-[180px] animate-skeleton'),
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={captureIfCached}
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        className={cn(
          'block object-contain transition-opacity duration-300',
          // Feed (`full`): centered, grows to the full column width; a tall
          // viewport-relative cap keeps portrait media prominent (not tiny) in
          // the wide column. Chat: hugs its natural size, smaller cap.
          full ? 'mx-auto max-h-[70vh] max-w-full' : 'max-h-[340px] max-w-full',
          loading ? loading : loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </button>
  );
}

/** Human-friendly filename from an attachment (original name, else URL basename). */
function displayName(a: ChatAttachment): string {
  if (a.name) return a.name;
  try {
    const base = (a.url.split('?')[0] ?? '').split('/').pop() ?? 'file';
    return decodeURIComponent(base);
  } catch {
    return 'file';
  }
}

/**
 * Discord-style upload card for a video/file that's still sending: icon,
 * filename, size, and a linear progress bar that fills as bytes leave the
 * browser. Once the upload finishes the message re-renders as the real player
 * / download card.
 */
function UploadingCard({ a }: { a: ChatAttachment }) {
  const pct = Math.max(0, Math.min(100, a.progress ?? 0));
  return (
    <div className="w-[340px] max-w-full rounded-lg bg-secondary/60 p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-foreground">{displayName(a)}</p>
          {a.size != null && (
            <p className="text-[12px] tabular-nums text-muted-foreground">{formatBytes(a.size)}</p>
          )}
        </div>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-accent">
        <div
          className="h-full rounded-full bg-link transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Renders a mixed set of chat attachments (video / file / image) in a vertical
 * stack. Used when a message isn't a pure image album (which uses `ChatAlbum`).
 *
 * While `uploading`, the item just fades + gently pulses (no spinner) so it
 * reads clearly as "not sent yet". Video/images hug their own size (no black
 * letterbox bars, no border) like Discord.
 */
export function ChatMedia({
  attachments,
  uploading,
  onOpen,
  full,
}: {
  attachments: ChatAttachment[];
  uploading?: boolean;
  onOpen?: (url: string) => void;
  /** Feed variant: media fills the post's full width and centers (Twitter-style). */
  full?: boolean;
}) {
  const loading = uploading ? 'opacity-50 animate-pulse' : '';
  const t = useT('media');

  function renderItem(a: ChatAttachment): ReactNode {
    if (a.kind === 'video') {
      // Center the (content-hugging) player across the full post width.
      return full ? (
        <div className="flex w-full justify-center">
          <VideoPlayer src={a.url} uploading={uploading} />
        </div>
      ) : (
        <VideoPlayer src={a.url} uploading={uploading} />
      );
    }
    if (a.kind === 'image') {
      return <MediaImage src={a.url} loading={loading} full={full} onOpen={() => !uploading && onOpen?.(a.url)} />;
    }
    // Generic file → download card.
    return (
      <a
        href={uploading ? undefined : a.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex w-[320px] max-w-full items-center gap-3 rounded-lg bg-secondary/60 p-3 transition-colors hover:bg-secondary',
          uploading && 'pointer-events-none opacity-50 animate-pulse',
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">{displayName(a)}</span>
        {!uploading && <Download className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </a>
    );
  }

  return (
    <div className={cn('mt-0.5 flex w-full flex-col items-start gap-1', full ? 'max-w-full' : 'max-w-[440px]')}>
      {attachments.map((a, i) => {
        // While sending, video + files show the progress card (Discord-style).
        if (uploading && (a.kind === 'video' || a.kind === 'file')) {
          return <UploadingCard key={i} a={a} />;
        }
        // Spoilered media renders behind a reveal-on-click blur (never while uploading).
        if (a.spoiler && !uploading) {
          return (
            <SpoilerShell key={i} label={t('spoiler')} full={full}>
              {renderItem(a)}
            </SpoilerShell>
          );
        }
        return <Fragment key={i}>{renderItem(a)}</Fragment>;
      })}
    </div>
  );
}
