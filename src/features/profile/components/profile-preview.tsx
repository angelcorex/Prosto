'use client';

import Image from 'next/image';
import { Camera, ImagePlus } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { frameStyle } from '@/lib/utils/frame';
import { EmojiText } from '@/components/ui';
import { PostText } from '@/features/posts/components/post-text';

interface ProfilePreviewProps {
  username: string;
  displayName?: string;
  bio?: string;
  pronouns?: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  avatarPos?: string | null;
  bannerPos?: string | null;
  onAvatarClick?: (anchor: DOMRect) => void;
  onBannerClick?: (anchor: DOMRect) => void;
}

export function ProfilePreview({
  username,
  displayName,
  bio,
  pronouns,
  avatarUrl,
  bannerUrl,
  avatarPos,
  bannerPos,
  onAvatarClick,
  onBannerClick,
}: ProfilePreviewProps) {
  const initial = username[0]?.toUpperCase() ?? '?';
  const name    = displayName?.trim() || username;

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-border/40 bg-card shadow-lg">
      {/* Banner */}
      <button
        type="button"
        onClick={(e) => onBannerClick?.(e.currentTarget.getBoundingClientRect())}
        disabled={!onBannerClick}
        aria-label="Change banner"
        className="group relative block h-[100px] w-full bg-secondary disabled:cursor-default"
      >
        {bannerUrl && (
          <Image
            src={bannerUrl}
            alt=""
            fill
            sizes="320px"
            className="object-cover"
            style={frameStyle(bannerPos)}
            unoptimized={bannerUrl.startsWith('blob:')}
          />
        )}
        {onBannerClick && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <ImagePlus className="h-5 w-5 text-white" />
          </span>
        )}
      </button>

      {/* Avatar overlapping banner */}
      <div className="relative px-4">
        <div className="absolute -top-10 left-4">
          <button
            type="button"
            onClick={(e) => onAvatarClick?.(e.currentTarget.getBoundingClientRect())}
            disabled={!onAvatarClick}
            aria-label="Change avatar"
            className={cn(
              'group relative flex h-[80px] w-[80px] items-center justify-center overflow-hidden rounded-full bg-link/20 ring-[6px] ring-card disabled:cursor-default',
            )}
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={name}
                fill
                sizes="80px"
                className="object-cover"
                style={frameStyle(avatarPos)}
                unoptimized={avatarUrl.startsWith('blob:')}
              />
            ) : (
              <span className="text-3xl font-bold text-link">{initial}</span>
            )}
            {onAvatarClick && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </span>
            )}
          </button>
          <span className="pointer-events-none absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-card bg-success" />
        </div>
      </div>

      {/* Info */}
      <div className="px-4 pb-5 pt-12">
        <p className="text-[18px] font-bold leading-tight"><EmojiText content={name} clamp /></p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0">
          <p className="text-[13px] text-muted-foreground">@{username}</p>
          {pronouns?.trim() && (
            <>
              <span className="text-[11px] text-muted-foreground/40">·</span>
              <EmojiText content={pronouns.trim()} className="text-[13px] text-muted-foreground/70" />
            </>
          )}
        </div>
        {bio?.trim() && (
          <PostText content={bio.trim()} className="mb-0 mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/70 line-clamp-4" />
        )}
      </div>
    </div>
  );
}
