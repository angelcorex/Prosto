'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils/cn';
import type { SignupPoint } from '../types';

/**
 * Lightweight area/line chart for the daily-signups series. Pure inline SVG —
 * no chart dependency (per the Constitution: prefer zero-dep, own the tokens).
 * Uses a viewBox so it scales fluidly to the container width.
 */
export function SignupsChart({ data }: { data: SignupPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = 180;
  const PAD = 8;

  const { path, area, max, points } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.count));
    const n = Math.max(1, data.length - 1);
    const x = (i: number) => PAD + (i / n) * (W - PAD * 2);
    const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
    const pts = data.map((d, i) => ({ x: x(i), y: y(d.count), ...d }));
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const firstPt = pts[0];
    const area = last && firstPt
      ? `${path} L${last.x.toFixed(1)},${H - PAD} L${firstPt.x.toFixed(1)},${H - PAD} Z`
      : '';
    return { path, area, max, points: pts };
  }, [data]);

  if (data.length === 0) return null;

  const active = hover != null ? points[hover] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Signups over time"
      >
        <defs>
          <linearGradient id="signups-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill="url(#signups-fill)" />
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} vectorEffect="non-scaling-stroke" />

        {points.map((p, i) => (
          <g key={p.day}>
            {/* Wide invisible hit target for hover */}
            <rect
              x={p.x - (W / points.length) / 2}
              y={0}
              width={W / points.length}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
            {hover === i && (
              <circle cx={p.x} cy={p.y} r={3.5} fill="hsl(var(--primary))" vectorEffect="non-scaling-stroke" />
            )}
          </g>
        ))}
      </svg>

      {active && (
        <div
          className={cn(
            'pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-border/40',
            'bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md',
          )}
          style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
        >
          <span className="font-semibold">{active.count}</span>{' '}
          <span className="text-muted-foreground">
            {new Date(active.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
      )}

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/50">
        <span>{new Date(data[0]!.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>peak {max}</span>
        <span>{new Date(data[data.length - 1]!.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}
