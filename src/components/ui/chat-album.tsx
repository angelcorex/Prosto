'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils/cn';

/** One mosaic cell — fills its slot and crops (object-cover). */
function Tile({
  url,
  onOpen,
  className,
}: {
  url: string;
  onOpen?: (url: string) => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => !failed && onOpen?.(url)}
      aria-label="Open image"
      className={cn('relative block h-full w-full min-w-0 overflow-hidden bg-muted', className)}
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full cursor-zoom-in object-cover transition-opacity hover:opacity-90"
        />
      )}
    </button>
  );
}

/** Split N images into rows: the remainder (1 or 2) sits on top, then rows of 3. */
function albumRows(n: number): number[] {
  const rows: number[] = [];
  const r = n % 3;
  if (r !== 0) rows.push(r);
  for (let i = 0; i < Math.floor(n / 3); i++) rows.push(3);
  return rows;
}

/** Row aspect: a lone image is a wide banner, otherwise the tiles read square. */
function rowAspectClass(count: number): string {
  if (count === 1) return 'aspect-[2/1]';
  if (count === 2) return 'aspect-[2/1]';
  return 'aspect-[3/1]';
}

/**
 * Discord-style image "album" (2..10 images):
 *  • 2  → side by side
 *  • 3  → one large left + two stacked right
 *  • 4  → 2×2
 *  • 5+ → a remainder row on top (1 wide feature, or 2 squares) then rows of 3
 *         (e.g. 5 = 2+3, 7 = 1+3+3, 10 = 1+3+3+3).
 *
 * Cells crop to fill; clicking opens the viewer. The outer container is rounded
 * + clipped so only the outer corners round and the thin gaps show the chat
 * background. A single image should use `ChatGif` instead.
 */
export function ChatAlbum({
  urls,
  pending,
  uploading,
  onOpen,
  full,
}: {
  urls: string[];
  pending?: boolean;
  /** Show an upload-in-progress overlay (message sent, media still uploading). */
  uploading?: boolean;
  onOpen?: (url: string) => void;
  /** Feed variant: the mosaic fills the post's full width (Twitter-style). */
  full?: boolean;
}) {
  const n = urls.length;
  const box = 'mt-0.5 w-full overflow-hidden rounded-lg';
  // Chat hugs a compact 440px; the feed lets the album fill the wider column.
  const mw = full ? 'max-w-full' : 'max-w-[440px]';

  let inner: React.ReactNode;

  if (n === 2) {
    inner = (
      <div className={cn(box, mw, 'grid aspect-[2/1] grid-cols-2 grid-rows-1 gap-1')}>
        <Tile url={urls[0]!} onOpen={onOpen} />
        <Tile url={urls[1]!} onOpen={onOpen} />
      </div>
    );
  } else if (n === 3) {
    inner = (
      <div className={cn(box, mw, 'grid aspect-[3/2] grid-cols-3 grid-rows-2 gap-1')}>
        <Tile url={urls[0]!} onOpen={onOpen} className="col-span-2 row-span-2" />
        <Tile url={urls[1]!} onOpen={onOpen} />
        <Tile url={urls[2]!} onOpen={onOpen} />
      </div>
    );
  } else if (n === 4) {
    inner = (
      <div className={cn(box, full ? 'max-w-full' : 'max-w-[400px]', 'grid aspect-square grid-cols-2 grid-rows-2 gap-1')}>
        {urls.map((u, i) => (
          <Tile key={`${u}-${i}`} url={u} onOpen={onOpen} />
        ))}
      </div>
    );
  } else {
    const rows = albumRows(n);
    let idx = 0;
    inner = (
      <div className={cn(box, mw, 'flex flex-col gap-1')}>
        {rows.map((count, ri) => {
          const slice = urls.slice(idx, idx + count);
          idx += count;
          return (
            <div key={ri} className={cn('flex gap-1', rowAspectClass(count))}>
              {slice.map((u, i) => (
                <Tile key={`${u}-${i}`} url={u} onOpen={onOpen} className="flex-1" />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('w-full', uploading ? 'opacity-50 animate-pulse' : pending && 'opacity-50')}>
      {inner}
    </div>
  );
}
