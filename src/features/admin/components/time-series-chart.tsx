'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils/cn';

export interface SeriesPoint {
  t: string;  // ISO timestamp or date
  v: number;
}

/**
 * Generic line/area time-series chart (zero-dep inline SVG). Shares the visual
 * language of SignupsChart but takes {t,v} points and renders a time x-axis
 * with a hover tooltip. Used by the dashboard drill-down modal.
 */
export function TimeSeriesChart({ data, unit }: { data: SeriesPoint[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 240;
  const PAD = 10;

  const { path, area, max, min, points } = useMemo(() => {
    const vals = data.map((d) => d.v);
    const max = Math.max(1, ...vals);
    const min = Math.min(0, ...vals);
    const range = Math.max(1, max - min);
    const n = Math.max(1, data.length - 1);
    const x = (i: number) => PAD + (i / n) * (W - PAD * 2);
    const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
    const pts = data.map((d, i) => ({ x: x(i), y: y(d.v), ...d }));
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const first = pts[0];
    const area = last && first ? `${path} L${last.x.toFixed(1)},${H - PAD} L${first.x.toFixed(1)},${H - PAD} Z` : '';
    return { path, area, max, min, points: pts };
  }, [data]);

  if (data.length === 0) return null;

  const active = hover != null ? points[hover] : null;
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="Metric over time">
        <defs>
          <linearGradient id="ts-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ts-fill)" />
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <rect
            key={`${p.t}-${i}`}
            x={p.x - (W / points.length) / 2}
            y={0}
            width={W / points.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover((h) => (h === i ? null : h))}
          />
        ))}
        {active && <circle cx={active.x} cy={active.y} r={3.5} fill="hsl(var(--primary))" vectorEffect="non-scaling-stroke" />}
      </svg>

      {active && (
        <div
          className={cn(
            'pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border/40',
            'bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md',
          )}
          style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
        >
          <span className="font-semibold tabular-nums">{active.v}</span>
          {unit && <span className="text-muted-foreground"> {unit}</span>}
          <span className="ml-1 text-muted-foreground">· {fmtTime(active.t)}</span>
        </div>
      )}

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/50">
        <span>{fmtTime(data[0]!.t)}</span>
        <span>min {min} · max {max}</span>
        <span>{fmtTime(data[data.length - 1]!.t)}</span>
      </div>
    </div>
  );
}
