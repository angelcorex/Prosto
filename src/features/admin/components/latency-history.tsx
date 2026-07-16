'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { getMetricSeries } from '../api/actions';
import { TimeSeriesChart, type SeriesPoint } from './time-series-chart';

const RANGES: { key: string; hours: number; labelKey: string }[] = [
  { key: '24h', hours: 24, labelKey: 'range24h' },
  { key: '7d', hours: 168, labelKey: 'range7d' },
  { key: '30d', hours: 720, labelKey: 'range30d' },
];

/**
 * History charts for the latency probes that HAVE a time series: the API
 * gateway round-trip and the DB query cost, both recorded into metric_snapshots
 * from the heartbeat. (Media proxy + event-loop are point-in-time only.)
 */
export function LatencyHistory() {
  const t = useT('admin');
  const [hours, setHours] = useState(168);
  const [gateway, setGateway] = useState<SeriesPoint[] | null | undefined>(undefined);
  const [db, setDb] = useState<SeriesPoint[] | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setGateway(undefined); setDb(undefined);
    getMetricSeries('gateway_ms', hours).then((r) => { if (live) setGateway('points' in r ? r.points : []); });
    getMetricSeries('db_ms', hours).then((r) => { if (live) setDb('points' in r ? r.points : []); });
    return () => { live = false; };
  }, [hours]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t('latHistoryTitle')}</h2>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setHours(r.hours)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                hours === r.hours ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Chart title={t('latGateway')} desc={t('latGatewayHint')} points={gateway} empty={t('noLatencyHistory')} />
        <Chart title={t('latDbQuery')} desc={t('latDbQueryHint')} points={db} empty={t('noLatencyHistory')} />
      </div>
    </div>
  );
}

function Chart({
  title,
  desc,
  points,
  empty,
}: {
  title: string;
  desc: string;
  points: SeriesPoint[] | null | undefined;
  empty: string;
}) {
  const vals = points?.map((p) => p.v) ?? [];
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;

  return (
    <section className="rounded-2xl border border-border/30 bg-foreground/[0.02] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground/60">{desc}</p>
        </div>
        {points && points.length > 0 && (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{min}–{max} · ~{avg} ms</span>
        )}
      </div>
      {points === undefined ? (
        <div className="h-[200px] animate-pulse rounded-xl bg-foreground/[0.03]" />
      ) : points && points.length > 0 ? (
        <TimeSeriesChart data={points} unit="ms" />
      ) : (
        <div className="flex h-[160px] items-center justify-center text-center text-xs text-muted-foreground">{empty}</div>
      )}
    </section>
  );
}
