import type { CSSProperties } from 'react';

/**
 * Framing for a profile avatar/banner, stored as a compact "x,y,scale" string
 * (x/y = object-position percentages, scale ≥ 1 = zoom around that point).
 *
 * The GIF framer and every display site apply the SAME CSS derived here, so a
 * GIF stays animated yet is positioned/zoomed exactly as previewed (WYSIWYG).
 * Returns undefined for the default (centered, no zoom).
 */
export function frameStyle(pos?: string | null): CSSProperties | undefined {
  if (!pos) return undefined;
  const parts = pos.split(',').map((n) => Number(n));
  const x = parts[0];
  const y = parts[1];
  const scale = parts[2];
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const op = `${x}% ${y}%`;
  const z = Number.isFinite(scale) && (scale as number) > 1 ? (scale as number) : 1;
  return z > 1
    ? { objectPosition: op, transform: `scale(${z})`, transformOrigin: op }
    : { objectPosition: op };
}
