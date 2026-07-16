'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, X } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

/** `m:ss` — compact clock for the control bar. */
function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Minimalist, glass-style video player for chat attachments and the feed.
 *
 * - Inline: hugs the video's natural size with a frosted-glass control bar.
 * - "Fullscreen": a CSS fixed-overlay modal (not the native Fullscreen API)
 *   so it stays within the browser window and never goes behind the OS taskbar.
 *
 * While `uploading` the video just fades + pulses (no controls).
 */
export function VideoPlayer({
  src,
  uploading,
  className,
}: {
  src: string;
  uploading?: boolean;
  className?: string;
}) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const inlineRef = useRef<HTMLDivElement>(null);
  const modalRef  = useRef<HTMLDivElement>(null);
  // We keep TWO video elements: one inline, one in the modal. When the modal
  // opens we sync the playback position from the inline video, then play the
  // modal video. This avoids a flicker and keeps the timeline continuous.
  const inlineVideoRef = useRef<HTMLVideoElement>(null);
  const modalVideoRef  = useRef<HTMLVideoElement>(null);
  const idleRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [playing,     setPlaying]     = useState(false);
  const [muted,       setMuted]       = useState(false);
  const [volume,      setVolumeState] = useState(1);
  const [volDrag,     setVolDrag]     = useState(false);
  const [current,     setCurrent]     = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [expanded,    setExpanded]    = useState(false);
  const [seeking,     setSeeking]     = useState(false);
  const [active,      setActive]      = useState(true);
  const [metaLoaded,  setMetaLoaded]  = useState(false);
  const [mounted,     setMounted]     = useState(false);

  // Modal-specific (can have independent seek/active state).
  const [modalSeeking, setModalSeeking] = useState(false);
  const [modalActive,  setModalActive]  = useState(true);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => {
    if (idleRef.current)      clearTimeout(idleRef.current);
    if (modalIdleRef.current) clearTimeout(modalIdleRef.current);
  }, []);

  // Adopt cached metadata synchronously on mount.
  useEffect(() => {
    const v = inlineVideoRef.current;
    if (v && v.readyState >= 1) {
      setDuration(v.duration || 0);
      setMetaLoaded(true);
    }
  }, []);

  // Close modal on Escape.
  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  if (uploading) {
    return (
      <div className={cn('inline-flex overflow-hidden rounded-xl', className)}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={src}
          preload="metadata"
          muted
          playsInline
          className="block max-h-[360px] max-w-full animate-pulse opacity-50"
        />
      </div>
    );
  }

  const pct           = duration > 0 ? (current / duration) * 100 : 0;
  // While dragging the volume slider the whole bar must stay visible — otherwise
  // the 2.2s idle timer hides it (and the popup) mid-adjustment.
  const showInlineBar = seeking || volDrag || !playing || active;
  const showModalBar  = modalSeeking || volDrag || !playing || modalActive;

  function poke() {
    setActive(true);
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setActive(false), 2200);
  }

  function pokModal() {
    setModalActive(true);
    if (modalIdleRef.current) clearTimeout(modalIdleRef.current);
    modalIdleRef.current = setTimeout(() => setModalActive(false), 2200);
  }

  function togglePlay(vid?: HTMLVideoElement | null) {
    const v = vid ?? inlineVideoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }

  function toggleMute(vid?: HTMLVideoElement | null) {
    const v = vid ?? inlineVideoRef.current;
    if (!v) return;
    // Sync mute to both videos.
    const next = !v.muted;
    if (inlineVideoRef.current) inlineVideoRef.current.muted = next;
    if (modalVideoRef.current)  modalVideoRef.current.muted  = next;
    setMuted(next);
    // Unmuting a silenced track restores audible volume so the slider isn't stuck at 0.
    if (!next && volume === 0) setVolume(1);
  }

  /** Set audible volume (0..1) on both video elements; volume 0 implies muted. */
  function setVolume(ratio: number) {
    const v = Math.min(1, Math.max(0, ratio));
    const silent = v === 0;
    if (inlineVideoRef.current) { inlineVideoRef.current.volume = v; inlineVideoRef.current.muted = silent; }
    if (modalVideoRef.current)  { modalVideoRef.current.volume  = v; modalVideoRef.current.muted  = silent; }
    setVolumeState(v);
    setMuted(silent);
  }

  function volumeFrom(e: React.PointerEvent<HTMLDivElement>) {
    // Vertical slider: top = loudest, bottom = silent.
    const rect = e.currentTarget.getBoundingClientRect();
    setVolume(1 - (e.clientY - rect.top) / rect.height);
  }

  function openModal() {
    const inline = inlineVideoRef.current;
    if (!inline) return;
    // Pause the inline video.
    inline.pause();
    const pos = inline.currentTime;
    setExpanded(true);
    setModalActive(true);
    // Give the modal video a tick to mount, then sync position and play.
    requestAnimationFrame(() => {
      const modal = modalVideoRef.current;
      if (!modal) return;
      modal.muted = inline.muted;
      modal.currentTime = pos;
      void modal.play().catch(() => {});
    });
  }

  function closeModal() {
    const modal  = modalVideoRef.current;
    const inline = inlineVideoRef.current;
    const pos    = modal?.currentTime ?? 0;
    modal?.pause();
    setExpanded(false);
    // Sync position back to inline and let it stay paused.
    if (inline) {
      inline.currentTime = pos;
      inline.muted = modal?.muted ?? false;
    }
    setPlaying(false);
    setActive(true);
  }

  function seekTo(e: React.PointerEvent<HTMLDivElement>, vid: HTMLVideoElement | null) {
    if (!vid) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (duration > 0) {
      vid.currentTime = ratio * duration;
      setCurrent(vid.currentTime);
    }
  }

  function nudge(delta: number, vid: HTMLVideoElement | null) {
    if (!vid || duration <= 0) return;
    vid.currentTime = Math.min(duration, Math.max(0, vid.currentTime + delta));
    setCurrent(vid.currentTime);
  }

  // ── Shared control bar ────────────────────────────────────────────────────
  function ControlBar({
    vid,
    show,
    onSeekStart,
    onSeekEnd,
    isModal,
  }: {
    vid: React.RefObject<HTMLVideoElement | null>;
    show: boolean;
    onSeekStart: () => void;
    onSeekEnd:   () => void;
    isModal:     boolean;
  }) {
    return (
      <div
        className={cn(
          'absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 text-white shadow-lg backdrop-blur-md transition-opacity duration-200',
          show ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <button
          type="button"
          onClick={() => togglePlay(vid.current)}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white"
        >
          {playing ? <Pause className="h-[18px] w-[18px]" /> : <Play className="h-[18px] w-[18px]" />}
        </button>

        <span className="shrink-0 text-[11px] font-medium tabular-nums text-white/80">
          {fmt(current)} / {fmt(duration)}
        </span>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration) || 0}
          aria-valuenow={Math.floor(current)}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onSeekStart(); seekTo(e, vid.current); }}
          onPointerMove={(e) => { if (isModal ? modalSeeking : seeking) seekTo(e, vid.current); }}
          onPointerUp={(e) => { onSeekEnd(); e.currentTarget.releasePointerCapture(e.pointerId); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); nudge(5, vid.current); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-5, vid.current); }
            else if (e.key === 'Home') { e.preventDefault(); nudge(-duration, vid.current); }
            else if (e.key === 'End') { e.preventDefault(); nudge(duration, vid.current); }
          }}
          className="group/seek relative flex h-4 flex-1 cursor-pointer items-center outline-none"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-none" style={{ width: `${pct}%` }} />
          </div>
          <span
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
            style={{ left: `${pct}%` }}
          />
        </div>

        {/* Volume: mute toggle + vertical slider that pops up above on hover. */}
        <div className="group/vol relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => toggleMute(vid.current)}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white"
          >
            {muted || volume === 0 ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
          </button>
          {/* Bridge + panel: appear on hover of the group, above the button.
              While dragging the slider it's forced open so pointer-capture
              freezing the ancestor :hover can't make it vanish mid-drag. */}
          <div className={cn(
            'absolute bottom-full left-1/2 z-20 flex -translate-x-1/2 flex-col items-center pb-2 transition-opacity duration-150 focus-within:pointer-events-auto focus-within:opacity-100 group-hover/vol:pointer-events-auto group-hover/vol:opacity-100',
            volDrag ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          )}>
            <div className="rounded-lg border border-white/10 bg-black/70 p-2 shadow-lg backdrop-blur-md">
              <div
                role="slider"
                tabIndex={0}
                aria-label="Volume"
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setVolDrag(true); volumeFrom(e); }}
                onPointerMove={(e) => { if (volDrag) volumeFrom(e); }}
                onPointerUp={(e) => { setVolDrag(false); e.currentTarget.releasePointerCapture(e.pointerId); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setVolume((muted ? 0 : volume) + 0.1); }
                  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setVolume((muted ? 0 : volume) - 0.1); }
                }}
                className="group/volslider relative flex h-20 w-4 cursor-pointer touch-none items-end justify-center outline-none"
              >
                <div className="relative h-full w-1 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="absolute bottom-0 left-0 w-full rounded-full bg-white transition-none"
                    style={{ height: `${(muted ? 0 : volume) * 100}%` }}
                  />
                </div>
                <span
                  className="pointer-events-none absolute left-1/2 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow"
                  style={{ bottom: `${(muted ? 0 : volume) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Expand / collapse */}
        <button
          type="button"
          onClick={isModal ? closeModal : openModal}
          aria-label={isModal ? 'Collapse' : 'Expand'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white"
        >
          {isModal ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
        </button>
      </div>
    );
  }

  // ── Inline player ─────────────────────────────────────────────────────────
  return (
    <>
      <div
        ref={inlineRef}
        onMouseMove={poke}
        onMouseLeave={() => playing && setActive(false)}
        className={cn(
          'group relative overflow-hidden rounded-xl',
          'inline-flex',
          // Hold a minimum size only while metadata is unknown so the play
          // button doesn't sit on a 0×0 element. Once metadata is known we
          // trust the natural video dimensions.
          !metaLoaded && 'min-h-[90px] min-w-[140px] bg-black/20',
          playing && !showInlineBar && 'cursor-none',
          className,
        )}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={inlineVideoRef}
          src={src}
          preload="metadata"
          playsInline
          onClick={() => togglePlay(inlineVideoRef.current)}
          onPlay={() => { setPlaying(true); poke(); }}
          onPause={() => { setPlaying(false); setActive(true); }}
          onEnded={() => { setPlaying(false); setActive(true); }}
          onTimeUpdate={(e) => { if (!seeking && !expanded) setCurrent(e.currentTarget.currentTime); }}
          onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setMetaLoaded(true); }}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          className={cn(
            'block cursor-pointer transition-opacity duration-200',
            metaLoaded ? 'opacity-100' : 'opacity-0',
            'max-h-[360px] max-w-full',
          )}
        />

        {/* Center play affordance (inline, paused). */}
        {!playing && metaLoaded && (
          <button
            type="button"
            onClick={() => togglePlay(inlineVideoRef.current)}
            aria-label="Play"
            className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-sm transition-transform hover:scale-105"
          >
            <Play className="h-5 w-5 translate-x-[1px]" />
          </button>
        )}

        {metaLoaded && (
          <ControlBar
            vid={inlineVideoRef}
            show={showInlineBar}
            onSeekStart={() => setSeeking(true)}
            onSeekEnd={() => setSeeking(false)}
            isModal={false}
          />
        )}
      </div>

      {/* ── Modal (CSS fixed overlay — stays inside the browser window) ── */}
      {expanded && mounted && createPortal(
        <div
          ref={modalRef}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={(e) => { if (e.target === modalRef.current) closeModal(); }}
          onMouseMove={pokModal}
        >
          {/* Close button — pinned top-right, clears the desktop title bar. */}
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="overlay-close-btn z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Modal video — centered, max 90% of viewport */}
          <div
            className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center overflow-hidden rounded-2xl"
            onMouseMove={pokModal}
            onMouseLeave={() => playing && setModalActive(false)}
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={modalVideoRef}
              src={src}
              playsInline
              onClick={() => togglePlay(modalVideoRef.current)}
              onPlay={() => { setPlaying(true); pokModal(); }}
              onPause={() => { setPlaying(false); setModalActive(true); }}
              onEnded={() => { setPlaying(false); setModalActive(true); }}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
              onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
              className={cn(
                'block max-h-[90vh] max-w-[90vw] cursor-pointer',
                playing && !showModalBar && 'cursor-none',
              )}
            />

            {!playing && (
              <button
                type="button"
                onClick={() => togglePlay(modalVideoRef.current)}
                aria-label="Play"
                className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-sm transition-transform hover:scale-105"
              >
                <Play className="h-6 w-6 translate-x-[1px]" />
              </button>
            )}

            <ControlBar
              vid={modalVideoRef}
              show={showModalBar}
              onSeekStart={() => setModalSeeking(true)}
              onSeekEnd={() => setModalSeeking(false)}
              isModal
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
