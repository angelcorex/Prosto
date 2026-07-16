'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { Button } from './button';

/**
 * Positions/zooms an animated GIF for use as an avatar/banner WITHOUT losing
 * animation. Instead of re-encoding, it lets the user drag (focal point) and
 * zoom, then returns an "x,y,scale" string; the display applies the identical
 * CSS (see frameStyle), so what you frame is exactly what shows.
 */
export function GifFramer({
  src, shape = 'circle', aspect = 1, onCancel, onApply,
}: {
  src: string;
  shape?: 'circle' | 'rect';
  /** width / height for rect frames. */
  aspect?: number;
  onCancel: () => void;
  onApply: (pos: string) => void;
}) {
  const t = useT('cropper');
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const W = shape === 'circle' ? 260 : 320;
  const H = shape === 'circle' ? 260 : Math.round(320 / (aspect || 1));

  function onDown(e: React.PointerEvent) {
    drag.current = { px: e.clientX, py: e.clientY, x, y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const rect = box.getBoundingClientRect();
    const dx = ((e.clientX - d.px) / rect.width) * 100;
    const dy = ((e.clientY - d.py) / rect.height) * 100;
    // Dragging the image right reveals more of its left → object-position x down.
    setX(Math.max(0, Math.min(100, d.x - dx)));
    setY(Math.max(0, Math.min(100, d.y - dy)));
  }
  function onUp() { drag.current = null; }

  const op = `${x}% ${y}%`;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-popover p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{t('title')}</h2>
          <button type="button" onClick={onCancel} aria-label={t('cancel')} className="text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex justify-center">
          <div
            ref={boxRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className={cn('relative cursor-move touch-none select-none overflow-hidden bg-black/30 ring-1 ring-border/50', shape === 'circle' ? 'rounded-full' : 'rounded-2xl')}
            style={{ width: W, height: H }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              draggable={false}
              className="h-full w-full select-none object-cover"
              style={{ objectPosition: op, transform: `scale(${scale})`, transformOrigin: op }}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-link"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">
            {t('cancel')}
          </button>
          <Button type="button" size="sm" onClick={() => onApply(`${Math.round(x)},${Math.round(y)},${Number(scale.toFixed(2))}`)} className="px-6">
            {t('apply')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
