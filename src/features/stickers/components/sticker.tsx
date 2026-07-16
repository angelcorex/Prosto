'use client';

import { cn } from '@/lib/utils/cn';

/**
 * Renders a sticker image with download/selection blocked: not draggable, no
 * context menu, no pointer events (so "save image as" / drag-out don't work)
 * and not selectable. It's a sticker, not a shareable file.
 */
export function Sticker({
  url,
  pending,
  size = 128,
}: {
  url: string;
  pending?: boolean;
  size?: number;
}) {
  return (
    <div
      className="mt-0.5 select-none"
      style={{ width: size, height: size }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={cn(
          'pointer-events-none h-full w-full select-none object-contain',
          pending && 'opacity-50',
        )}
      />
    </div>
  );
}
