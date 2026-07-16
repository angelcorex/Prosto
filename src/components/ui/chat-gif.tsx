'use client';

import { useCallback, useState } from 'react';
import { Star } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

/**
 * A chat image / GIF rendered from a remote URL. When the link is dead (load
 * error) it collapses to a plain empty grey placeholder — no broken-image
 * icon, no link, no actions — so dead media just leaves a quiet gap.
 *
 * Optionally shows a hover "favourite" star when `onToggleFavorite` is given.
 */
export function ChatGif({
  src,
  pending,
  uploading,
  isFavorite = false,
  onToggleFavorite,
  favTitle,
  addFavTitle,
  onOpen,
}: {
  src: string;
  pending?: boolean;
  /** Show an upload-in-progress overlay (message sent, media still uploading). */
  uploading?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  favTitle?: string;
  addFavTitle?: string;
  /** When provided, clicking opens the in-app viewer instead of a new tab. */
  onOpen?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // A cached image is already `complete` on mount — show it instantly instead
  // of replaying the opacity-0 → 1 fade (which flickers on every revisit).
  const captureIfCached = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true);
  }, []);

  if (failed) {
    return <div className="mt-0.5 h-[150px] w-[220px] max-w-full rounded-lg bg-muted" aria-hidden />;
  }

  const imgEl = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={captureIfCached}
      src={src}
      alt="gif"
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
      className={cn(
        'max-h-[340px] max-w-[340px] rounded-lg object-contain ring-1 ring-border/40 transition-opacity duration-300',
        !loaded ? 'opacity-0' : uploading || pending ? 'opacity-50' : 'opacity-100',
        loaded && uploading && 'animate-pulse',
      )}
    />
  );

  return (
    <div className="group/gif relative mt-0.5 w-fit">
      {/* Reserve a placeholder box so the image fades in instead of popping in
          from zero height (no "nothing → blink → appears" flash). */}
      <div className={cn('overflow-hidden rounded-lg', !loaded && 'min-h-[120px] min-w-[180px] animate-skeleton')}>
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block cursor-zoom-in" aria-label="Open image">
            {imgEl}
          </button>
        ) : (
          <a href={src} target="_blank" rel="noopener noreferrer" className="block">
            {imgEl}
          </a>
        )}
      </div>
      {!pending && !uploading && onToggleFavorite && (
        <button
          type="button"
          title={isFavorite ? favTitle : addFavTitle}
          onClick={onToggleFavorite}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-all hover:scale-110 hover:bg-black/75 group-hover/gif:opacity-100"
        >
          <Star className={cn('h-4 w-4', isFavorite && 'fill-warning text-warning')} />
        </button>
      )}
    </div>
  );
}
