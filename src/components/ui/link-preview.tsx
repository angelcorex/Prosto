'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { useImageViewer } from '@/features/media';
import { firstPreviewableUrl, videoEmbedOf, type VideoEmbed } from '@/lib/link-preview/extract';
import type { LinkPreviewData } from '@/lib/link-preview/types';

/**
 * Discord/Twitter-style rich link preview shown under a message or post that
 * contains a URL. Mirrors ServerInviteEmbed's shape: self-contained, fetches
 * its own metadata, shows a skeleton, and renders nothing on failure so a bare
 * link just stays a bare link.
 *
 * Video links (YouTube / Vimeo) render a click-to-play facade that swaps in the
 * privacy-friendly embedded player on demand (no autoplay, no cookies until the
 * user clicks). Everything else renders an OpenGraph card.
 *
 * OG images come from arbitrary third-party hosts, so they CANNOT go through
 * next/image (its remotePatterns allow-list is storage/Ataraxis only). They use
 * a plain <img> with referrerPolicy="no-referrer" to avoid leaking the chat URL.
 */
export function LinkPreview({ content }: { content: string }) {
  const url = firstPreviewableUrl(content);
  if (!url) return null;
  const video = videoEmbedOf(url);
  return video
    ? <VideoPreview url={url} video={video} />
    : <OgPreview url={url} />;
}

/* ── OpenGraph card ── */
function OgPreview({ url }: { url: string }) {
  const t = useT('messages');
  const imageViewer = useImageViewer();
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    let active = true;
    setState('loading');
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LinkPreviewData | null) => {
        if (!active) return;
        if (d && (d.title || d.description || d.image)) { setData(d); setState('ready'); }
        else setState('empty');
      })
      .catch(() => { if (active) setState('empty'); });
    return () => { active = false; };
  }, [url]);

  if (state === 'loading') {
    return (
      <div className="mt-1.5 w-full max-w-[440px] overflow-hidden rounded-2xl border-l-[3px] border-border/40 bg-card/60 p-3 ring-1 ring-border/30">
        <div className="mb-2 h-2.5 w-20 animate-skeleton rounded" />
        <div className="mb-2 h-3.5 w-48 animate-skeleton rounded" />
        <div className="h-3 w-full animate-skeleton rounded" />
      </div>
    );
  }
  if (state === 'empty' || !data) return null;

  const host = data.siteName || (() => { try { return new URL(data.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();

  const img = data.image;
  return (
    <div className="mt-1.5 w-full max-w-[440px] overflow-hidden rounded-2xl border-l-[3px] border-link/60 bg-card/60 ring-1 ring-border/30">
      {img && imgOk && (
        // The image is its own click target: it opens the full-screen viewer
        // (zoom/inspect) rather than navigating away, Discord-style. The text
        // block below is the link to the page. `object-contain` + a max height
        // shows the WHOLE image (no crop), centred on a neutral backdrop.
        <button
          type="button"
          onClick={() => imageViewer.open({ src: img, subtitle: host })}
          title={t('viewImage')}
          className="block w-full cursor-zoom-in bg-black/5 dark:bg-white/5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="mx-auto max-h-[280px] w-full object-contain"
          />
        </button>
      )}
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block p-3 transition-colors hover:bg-card"
      >
        {host && (
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{host}</span>
          </p>
        )}
        {data.title && (
          <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground group-hover:text-link">
            {data.title}
          </p>
        )}
        {data.description && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {data.description}
          </p>
        )}
        <span className="sr-only">{t('openLink')}</span>
      </a>
    </div>
  );
}

/* ── Video facade → embedded player (YouTube / Vimeo) ── */
function VideoPreview({ url, video }: { url: string; video: VideoEmbed }) {
  const t = useT('messages');
  const [playing, setPlaying] = useState(false);
  // For YouTube we build the thumbnail URL directly (no fetch). For Vimeo we
  // fetch the OG image (Vimeo has no stable thumbnail-by-id URL).
  const [poster, setPoster] = useState<string | null>(
    video.provider === 'youtube' ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null,
  );
  const [posterOk, setPosterOk] = useState(true);

  useEffect(() => {
    if (video.provider !== 'vimeo') return;
    let active = true;
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LinkPreviewData | null) => { if (active && d?.image) setPoster(d.image); })
      .catch(() => {});
    return () => { active = false; };
  }, [url, video.provider]);

  const embedSrc = video.provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0${video.start ? `&start=${video.start}` : ''}`
    : `https://player.vimeo.com/video/${video.id}?autoplay=1`;

  return (
    <div className="mt-1.5 w-full max-w-[440px] overflow-hidden rounded-2xl bg-black ring-1 ring-border/30">
      <div className="relative aspect-video w-full">
        {playing ? (
          <iframe
            src={embedSrc}
            title={t('videoPlayer')}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={t('playVideo')}
            className="group absolute inset-0 flex items-center justify-center"
          >
            {poster && posterOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={poster}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setPosterOk(false)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 bg-accent/40" />
            )}
            <span className={cn(
              'relative flex h-14 w-14 items-center justify-center rounded-full bg-black/70 backdrop-blur-sm transition-transform',
              'group-hover:scale-110 group-hover:bg-red-600',
            )}>
              <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
