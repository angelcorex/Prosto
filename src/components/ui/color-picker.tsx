'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils/cn';
import { literalColors } from '@/config';

/** Fallback colour when the picker is opened without a value. */
const DEFAULT_COLOR = literalColors.brand;

/* ── HSV ↔ HEX ── */
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  if (c.length !== 6 || /[^0-9a-f]/i.test(c)) return { h: 270, s: 0.8, v: 0.9 };
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Discord-style colour picker: saturation/value box + hue slider + hex input. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const init = hexToHsv(value || DEFAULT_COLOR);
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [v, setV] = useState(init.v);
  const [hex, setHex] = useState((value || DEFAULT_COLOR).replace('#', ''));
  const dragging = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // Sync from an external value change (e.g. a preset swatch) unless dragging.
  useEffect(() => {
    if (dragging.current) return;
    const n = hexToHsv(value || DEFAULT_COLOR);
    setH(n.h); setS(n.s); setV(n.v); setHex((value || DEFAULT_COLOR).replace('#', ''));
  }, [value]);

  function emit(nh: number, ns: number, nv: number) {
    const out = hsvToHex(nh, ns, nv);
    setHex(out.replace('#', ''));
    onChange(out);
  }

  function onBox(e: React.PointerEvent | PointerEvent) {
    const el = boxRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const ns = clamp01((e.clientX - r.left) / r.width);
    const nv = 1 - clamp01((e.clientY - r.top) / r.height);
    setS(ns); setV(nv); emit(h, ns, nv);
  }
  function onHue(e: React.PointerEvent | PointerEvent) {
    const el = hueRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const nh = clamp01((e.clientX - r.left) / r.width) * 360;
    setH(nh); emit(nh, s, v);
  }

  function startDrag(move: (e: PointerEvent) => void, first: React.PointerEvent) {
    dragging.current = true;
    move(first.nativeEvent);
    const up = () => { dragging.current = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const hueColor = hsvToHex(h, 1, 1);

  return (
    <div className="flex w-[280px] flex-col gap-3 rounded-2xl bg-card p-3 shadow-2xl ring-1 ring-border/50">
      {/* Saturation / value box */}
      <div
        ref={boxRef}
        onPointerDown={(e) => startDrag(onBox as (e: PointerEvent) => void, e)}
        className="relative h-40 w-full cursor-crosshair rounded-lg"
        style={{ backgroundColor: hueColor }}
      >
        <div className="absolute inset-0 rounded-lg" style={{ backgroundImage: 'linear-gradient(to right, #fff, rgba(255,255,255,0))' }} />
        <div className="absolute inset-0 rounded-lg" style={{ backgroundImage: 'linear-gradient(to top, #000, rgba(0,0,0,0))' }} />
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        onPointerDown={(e) => startDrag(onHue as (e: PointerEvent) => void, e)}
        className="relative h-3.5 w-full cursor-pointer rounded-full"
        style={{ backgroundImage: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(h / 360) * 100}%` }}
        />
      </div>

      {/* Hex input */}
      <div className={cn('flex items-center gap-1.5 rounded-lg bg-secondary/60 px-3 py-2 ring-1 ring-transparent focus-within:ring-link/50')}>
        <span className="text-[15px] text-muted-foreground/60">#</span>
        <input
          value={hex}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
            setHex(raw);
            if (raw.length === 6 || raw.length === 3) {
              const n = hexToHsv(raw);
              setH(n.h); setS(n.s); setV(n.v);
              onChange(`#${raw}`);
            }
          }}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[15px] lowercase outline-none"
        />
      </div>
    </div>
  );
}
