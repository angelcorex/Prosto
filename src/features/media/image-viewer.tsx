'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AvatarImage } from '@/components/ui/avatar-image';
import { X, Download, ExternalLink, Forward, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { renderEmojiNodes } from '@/components/ui/emoji-text';

export interface ImageViewerItem {
  src: string;
  /** Who sent / posted it. */
  authorName?: string | null;
  authorAvatar?: string | null;
  /** Secondary line (e.g. time). */
  subtitle?: string | null;
}

interface Ctx {
  open: (item: ImageViewerItem) => void;
}

const ImageViewerContext = createContext<Ctx | null>(null);

/** Open the full-screen image/gif viewer from anywhere in the app. */
export function useImageViewer(): Ctx {
  const ctx = useContext(ImageViewerContext);
  if (!ctx) return { open: () => {} };
  return ctx;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export function ImageViewerProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<ImageViewerItem | null>(null);
  const open = useCallback((next: ImageViewerItem) => setItem(next), []);

  return (
    <ImageViewerContext.Provider value={{ open }}>
      {children}
      {item && <Lightbox item={item} onClose={() => setItem(null)} />}
    </ImageViewerContext.Provider>
  );
}

function Lightbox({ item, onClose }: { item: ImageViewerItem; onClose: () => void }) {
  const t = useT('media');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const moved = useRef(false);

  const reset = useCallback(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, []);

  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2)));
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Esc to close; +/- to zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomBy(0.5);
      else if (e.key === '-') zoomBy(-0.5);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, zoomBy, reset]);

  function onWheel(e: React.WheelEvent) {
    zoomBy(e.deltaY < 0 ? 0.35 : -0.35);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (zoom <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    moved.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    setOffset({ x: drag.current.ox + dx, y: drag.current.oy + dy });
  }
  function onPointerUp() { drag.current = null; }

  async function download() {
    try {
      const res = await fetch(item.src, { mode: 'cors' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.src.split('/').pop()?.split('?')[0] || 'image';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(item.src, '_blank', 'noopener,noreferrer');
    }
  }

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ url: item.src }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(item.src); } catch { /* ignore */ }
  }

  function openExternal() {
    window.open(item.src, '_blank', 'noopener,noreferrer');
  }

  if (typeof document === 'undefined') return null;

  const initial = (item.authorName ?? '?')[0]?.toUpperCase() ?? '?';

  return createPortal(
    <div
      className="app-overlay fixed inset-0 z-[100050] flex flex-col bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !moved.current) onClose(); }}
    >
      {/* Top bar — clears the desktop title bar / mobile status bar on top. */}
      <div className="overlay-top-safe flex shrink-0 items-center justify-between gap-3 px-4 pb-3">
        {/* Author */}
        <div className="flex min-w-0 items-center gap-2.5">
          {item.authorName != null && (
            <>
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/10">
                {item.authorAvatar
                  ? <AvatarImage src={item.authorAvatar} alt="" sizes="36px" className="object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white/80">{initial}</span>}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-white">{renderEmojiNodes(item.authorName ?? '')}</p>
                {item.subtitle && <p className="truncate text-[12px] text-white/50">{item.subtitle}</p>}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <ToolButton label={t('zoomOut')} onClick={() => zoomBy(-0.5)} disabled={zoom <= MIN_ZOOM}><ZoomOut className="h-5 w-5" /></ToolButton>
          <span className="w-11 text-center text-[12px] font-semibold tabular-nums text-white/70">{Math.round(zoom * 100)}%</span>
          <ToolButton label={t('zoomIn')} onClick={() => zoomBy(0.5)} disabled={zoom >= MAX_ZOOM}><ZoomIn className="h-5 w-5" /></ToolButton>
          <ToolButton label={t('fit')} onClick={reset} disabled={zoom === 1 && offset.x === 0 && offset.y === 0}><Maximize2 className="h-5 w-5" /></ToolButton>
          <span className="mx-1 h-5 w-px bg-white/15" />
          <ToolButton label={t('forward')} onClick={share}><Forward className="h-5 w-5" /></ToolButton>
          <ToolButton label={t('download')} onClick={download}><Download className="h-5 w-5" /></ToolButton>
          <ToolButton label={t('openInBrowser')} onClick={openExternal}><ExternalLink className="h-5 w-5" /></ToolButton>
          <ToolButton label={t('close')} onClick={onClose}><X className="h-5 w-5" /></ToolButton>
        </div>
      </div>

      {/* Image stage */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
        onWheel={onWheel}
        onClick={(e) => { if (e.target === e.currentTarget && !moved.current) onClose(); }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onDoubleClick={() => (zoom > 1 ? reset() : setZoom(2))}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          className={cn(
            'max-h-full max-w-full select-none rounded-lg object-contain shadow-2xl transition-transform duration-75 animate-zoom-in',
            zoom > 1 ? (drag.current ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
          )}
        />
      </div>
    </div>,
    document.body,
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
