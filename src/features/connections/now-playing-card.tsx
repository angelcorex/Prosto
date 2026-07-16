'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { PROVIDERS, type ProviderId } from './providers';
import type { NowPlaying } from './types';

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Providers that expose a live "now playing" endpoint, keyed by id. */
const STATUS_ENDPOINT: Partial<Record<ProviderId, string>> = {
  spotify:  '/api/connections/spotify/now-playing',
  ataraxis: '/api/connections/ataraxis/now-playing',
};

const LABEL_KEY: Partial<Record<ProviderId, string>> = {
  spotify:  'listeningToSpotify',
  ataraxis: 'listeningToAtaraxis',
};

/**
 * Live "now playing" card for a profile, for any status-capable provider
 * (Spotify, Ataraxis). Polls the provider's status endpoint and advances the
 * progress bar locally between polls. When the provider reports `startedAt`
 * (Ataraxis, which sends no live progress), progress is derived from wall-clock
 * elapsed since that timestamp; otherwise it advances from the reported
 * `progressMs` (Spotify). Renders nothing when nothing is playing.
 */
export function NowPlayingCard({
  username,
  provider,
  className,
}: {
  username: string;
  provider: ProviderId;
  className?: string;
}) {
  const t = useT('connections');
  const [np, setNp] = useState<NowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const fetchedAt = useRef(0);

  const endpoint = STATUS_ENDPOINT[provider];
  const meta = PROVIDERS[provider];

  useEffect(() => {
    if (!endpoint) return;
    let active = true;
    async function poll() {
      try {
        const res = await fetch(`${endpoint}?u=${encodeURIComponent(username)}`, { cache: 'no-store' });
        const data: NowPlaying = await res.json();
        if (!active) return;
        if (data.playing) {
          setNp(data);
          // Ataraxis: seed from startedAt so progress is correct even if we
          // joined mid-track; Spotify: use the reported progressMs.
          setProgress(data.startedAt ? Math.max(0, Date.now() - data.startedAt) : data.progressMs);
          fetchedAt.current = Date.now();
        } else {
          setNp(null);
        }
      } catch {
        if (active) setNp(null);
      }
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(id); };
  }, [username, endpoint]);

  // Advance the progress bar smoothly between polls.
  useEffect(() => {
    if (!np?.playing) return;
    const base = np.startedAt ? Math.max(0, Date.now() - np.startedAt) : np.progressMs;
    const id = setInterval(() => {
      const elapsed = Date.now() - fetchedAt.current;
      setProgress(Math.min(np.durationMs || Infinity, base + elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [np]);

  if (!endpoint || !np?.playing) return null;

  const pct = np.durationMs > 0 ? Math.min(100, (progress / np.durationMs) * 100) : 0;
  const labelKey = LABEL_KEY[provider] ?? 'listeningToSpotify';
  const accent = meta?.brandColor ?? '#a78bfa';

  const card = (
    <div className={cn('rounded-2xl border border-border/40 bg-card/60 p-4', className)}>
      <div className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
        <i className={meta?.icon} style={{ fontSize: 16, color: accent }} aria-hidden="true" />
        <span>{t(labelKey)}</span>
      </div>

      <div className="flex items-center gap-3">
        {np.albumArt && (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
            <Image src={np.albumArt} alt="" fill sizes="64px" className="object-cover" unoptimized />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight">{np.title}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{np.artists}</p>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground/70">{fmt(progress)}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <div className="h-full rounded-full bg-foreground/70 transition-all duration-1000 ease-linear" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground/70">{np.durationMs ? fmt(np.durationMs) : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return np.trackUrl
    ? <a href={np.trackUrl} target="_blank" rel="noopener noreferrer" className="block transition-opacity hover:opacity-90">{card}</a>
    : card;
}
