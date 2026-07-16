'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, ImagePlus, RotateCw, X } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';

interface ImageCropperProps {
  /** Object URL of the picked image. */
  src: string;
  /** Circle for avatars, rect for banners. */
  shape?: 'circle' | 'rect';
  /** Output aspect (width / height). Ignored for circle (always 1). */
  aspect?: number;
  /** Output width in px (height derived from aspect). */
  outputWidth?: number;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
}

const VIEW = 360; // viewport size (px)

export function ImageCropper({
  src,
  shape = 'circle',
  aspect = 1,
  outputWidth = 512,
  onCancel,
  onApply,
}: ImageCropperProps) {
  const t = useT('cropper');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [, force] = useState(0);

  const ratio = shape === 'circle' ? 1 : (aspect || 1);
  // Crop frame within the viewport.
  const FW = shape === 'circle' ? 300 : 320;
  const FH = shape === 'circle' ? 300 : Math.round(320 / ratio);
  const VW = VIEW;
  const VH = shape === 'circle' ? VIEW : Math.max(FH + 60, 220);

  // Base "cover the frame" scale at zoom = 1.
  const baseScale = useCallback(() => {
    const img = imgRef.current;
    if (!img) return 1;
    const rotated = rot % 180 !== 0;
    const eW = rotated ? img.naturalHeight : img.naturalWidth;
    const eH = rotated ? img.naturalWidth : img.naturalHeight;
    return Math.max(FW / eW, FH / eH);
  }, [rot, FW, FH]);

  const clampOffset = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const s = baseScale() * zoom;
    const rotated = rot % 180 !== 0;
    const extentX = (rotated ? img.naturalHeight : img.naturalWidth) * s;
    const extentY = (rotated ? img.naturalWidth : img.naturalHeight) * s;
    const maxX = Math.max(0, (extentX - FW) / 2);
    const maxY = Math.max(0, (extentY - FH) / 2);
    offset.current.x = Math.max(-maxX, Math.min(maxX, offset.current.x));
    offset.current.y = Math.max(-maxY, Math.min(maxY, offset.current.y));
  }, [baseScale, zoom, rot, FW, FH]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VW * dpr;
    canvas.height = VH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VW, VH);

    const s = baseScale() * zoom;
    ctx.save();
    ctx.translate(VW / 2 + offset.current.x, VH / 2 + offset.current.y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, (-img.naturalWidth * s) / 2, (-img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();

    // Dim everything outside the crop frame.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, VW, VH);
    const fx = (VW - FW) / 2;
    const fy = (VH - FH) / 2;
    if (shape === 'circle') {
      ctx.arc(VW / 2, VH / 2, FW / 2, 0, Math.PI * 2, true);
    } else {
      ctx.rect(fx, fy, FW, FH); // sub-path; evenodd carves it out
    }
    ctx.fill('evenodd');

    // Frame outline.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(VW / 2, VH / 2, FW / 2, 0, Math.PI * 2);
    else ctx.rect(fx, fy, FW, FH);
    ctx.stroke();
  }, [baseScale, zoom, rot, shape, FW, FH, VW, VH]);

  // Load image.
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setLoaded(true); };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (!loaded) return;
    clampOffset();
    draw();
  }, [loaded, zoom, rot, draw, clampOffset]);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX - offset.current.x, y: e.clientY - offset.current.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    offset.current = { x: e.clientX - drag.current.x, y: e.clientY - drag.current.y };
    clampOffset();
    draw();
    force((n) => n + 1);
  }
  function onPointerUp() { drag.current = null; }

  function reset() {
    setZoom(1);
    setRot(0);
    offset.current = { x: 0, y: 0 };
    draw();
  }

  function apply() {
    const img = imgRef.current;
    if (!img) return;
    const OW = outputWidth;
    const OH = Math.round(OW * (FH / FW));
    const k = OW / FW;
    const out = document.createElement('canvas');
    out.width = OW;
    out.height = OH;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    const s = baseScale() * zoom * k;
    ctx.save();
    ctx.translate(OW / 2 + offset.current.x * k, OH / 2 + offset.current.y * k);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, (-img.naturalWidth * s) / 2, (-img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();
    out.toBlob((blob) => { if (blob) onApply(blob); }, 'image/jpeg', 0.94);
  }

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-popover p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{t('title')}</h2>
          <button type="button" onClick={onCancel} aria-label={t('cancel')} className="text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex justify-center rounded-2xl bg-secondary/40 p-4">
          <canvas
            ref={canvasRef}
            style={{ width: VW, height: VH, touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>

        {/* Zoom + rotate */}
        <div className="mt-4 flex items-center gap-3">
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-link"
          />
          <ImagePlus className="h-5 w-5 shrink-0 text-muted-foreground" />
          <button
            type="button"
            onClick={() => { setRot((r) => (r + 90) % 360); }}
            aria-label={t('rotate')}
            className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RotateCw className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={reset} className="text-sm font-medium text-link hover:underline">{t('reset')}</button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent">{t('cancel')}</button>
            <button type="button" onClick={apply} className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">{t('apply')}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
