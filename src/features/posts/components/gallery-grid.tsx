import Link from 'next/link';

import { cn } from '@/lib/utils/cn';
import type { Post } from '../types';

/** Compact count, e.g. 1200 -> "1.2K". */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * Visual grid of a feed's media (one tile per post, using its first image or
 * video). Each tile links to the full post. NSFW media is blurred with an 18+
 * marker until the viewer opens the post (where the age gate handles reveal).
 */
export function GalleryGrid({ posts, emptyLabel }: { posts: Post[]; emptyLabel: string }) {
  const tiles = posts.flatMap((p) => {
    const media = p.attachments.filter((a) => a.kind === 'image' || a.kind === 'video');
    const first = media[0];
    return first ? [{ post: p, media: first, count: media.length }] : [];
  });

  if (tiles.length === 0) {
    return <p className="py-16 text-center text-[14px] text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-1 p-1 sm:gap-1.5 sm:p-1.5">
      {tiles.map(({ post, media, count }) => (
        <Link
          key={post.id}
          href={`/post/${post.id}`}
          className="group relative aspect-square overflow-hidden rounded-lg bg-secondary"
        >
          {media.kind === 'video' ? (
            <video
              src={media.url}
              muted
              playsInline
              preload="metadata"
              className={cn('h-full w-full object-cover', post.isNsfw && 'blur-2xl')}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.url}
              alt=""
              loading="lazy"
              className={cn(
                'h-full w-full object-cover transition-transform duration-300 group-hover:scale-105',
                post.isNsfw && 'blur-2xl',
              )}
            />
          )}

          {post.isNsfw && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[11px] font-bold uppercase tracking-wide text-white">
              18+
            </span>
          )}

          {media.kind === 'video' && (
            <i className="ri-play-circle-fill pointer-events-none absolute right-1.5 top-1.5 text-[18px] text-white/90 drop-shadow" aria-hidden="true" />
          )}
          {count > 1 && media.kind !== 'video' && (
            <i className="ri-stack-fill pointer-events-none absolute right-1.5 top-1.5 text-[16px] text-white/90 drop-shadow" aria-hidden="true" />
          )}

          <span className="touch-reveal pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-[12px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            <i className="ri-heart-fill text-[13px]" aria-hidden="true" /> {formatCount(post.likeCount)}
          </span>
        </Link>
      ))}
    </div>
  );
}
