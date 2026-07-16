'use client';

import { type CSSProperties } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils/cn';

/** Animated GIF? (only GIF avatars are the animated case in this app). */
function isGif(src: string): boolean {
  return /\.gif(?:$|\?)/i.test(src);
}

interface AvatarImageProps {
  src: string;
  alt: string;
  /** next/image sizes hint (non-GIF path). */
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  /** Accepted for call-site compatibility; GIF avatars now always animate. */
  animate?: boolean;
}

/**
 * Avatar image. Non-GIF avatars use next/image (unoptimized — see below). GIF
 * avatars render straight as an <img> so they paint instantly from cache with
 * no loading gap.
 *
 * Must be placed inside a positioned (relative) container — it fills it, like
 * `<Image fill />`. Pair it with AvatarWithStatus as before.
 */
export function AvatarImage({ src, alt, sizes = '64px', className, style }: AvatarImageProps) {
  const gif = isGif(src);

  if (!gif) {
    // Avatars are already cropped+compressed to a 512px JPEG on upload and shown
    // at ≤80px, so the Next image optimizer adds almost nothing — yet every one
    // is a request to `/_next/image` on the single-process VPS, and avatars are
    // the most numerous images on screen (feed, member lists, DM list, rail).
    // Serving them straight from storage (which sends `immutable` cache headers)
    // removes that serial optimizer bottleneck and makes them appear far faster.
    // blob:/data: previews (mid-upload) can't be optimized either.
    return <Image src={src} alt={alt} fill sizes={sizes} className={className} style={style} unoptimized />;
  }

  // GIF avatars render straight as an <img> — it paints immediately from the
  // browser cache (immutable storage headers) with NO blank/loading gap. The
  // old canvas "static first frame" approach left the avatar blank until the
  // GIF decoded (a visible loading flash), so it was removed. GIF avatars are a
  // minority and simply animate; that's the expected behaviour of a GIF avatar.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      loading="eager"
      decoding="async"
      className={cn('absolute inset-0 h-full w-full object-cover', className)}
      style={style}
    />
  );
}
