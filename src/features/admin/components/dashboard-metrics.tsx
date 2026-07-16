'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, UserCheck, Signal } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import type { AdminStats } from '../types';
import { getMetricSeries, type MetricKey } from '../api/actions';
import { TimeSeriesChart, type SeriesPoint } from './time-series-chart';

const RANGES: { key: string; hours: number; labelKey: string }[] = [
  { key: '24h', hours: 24, labelKey: 'range24h' },
  { key: '7d', hours: 168, labelKey: 'range7d' },
  { key: '30d', hours: 720, labelKey: 'range30d' },
];

type CardDef = { metric: MetricKey; label: string; value: number; hint: string; icon: typeof Users };

/**
 * Headline metrics + their history charts, all inline on the dashboard. Cards
 * are anchors: clicking one smooth-scrolls down to that metric's chart (no
 * modal). A shared range selector drives every chart at once. Series load
 * client-side and refetch when the range changes.
 */
export function DashboardMetrics({ stats }: { stats: AdminStats | null }) {
  const t = useT('admin');
  const nf = new Intl.NumberFormat();
  const [hours, setHours] = useState(168);
  const [series, setSeries] = useState<Record<string, SeriesPoint[] | null>>({});
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const cards: CardDef[] = [
    { metric: 'online', label: t('statOnline'), value: stats?.online ?? 0, hint: t('statOnlineHint'), icon: Signal },
    { metric: 'dau', label: t('statDau'), value: stats?.dau ?? 0, hint: `${t('statWau')}: ${nf.format(stats?.wau ?? 0)} · ${t('statMau')}: ${nf.format(stats?.mau ?? 0)}`, icon: UserCheck },
    { metric: 'total_users', label: t('statUsers'), value: stats?.total_users ?? 0, hint: `+${nf.format(stats?.new_7d ?? 0)} / 7${t('daysShort')}`, icon: Users },
    { metric: 'mau', label: t('statMau'), value: stats?.mau ?? 0, hint: t('statMauHint'), icon: UserCheck },
  ];

  // Load every metric's series for the chosen range.
  useEffect(() => {
    let live = true;
    setSeries({});
    for (const c of cards) {
      getMetricSeries(c.metric, hours).then((res) => {
        if (!live) return;
        setSeries((prev) => ({ ...prev, [c.metric]: 'points' in res ? res.points : [] }));
      });
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  function scrollTo(metric: string) {
    chartRefs.current[metric]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      {/* Cards — click to jump to the matching chart below */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.metric}
            type="button"
            onClick={() => scrollTo(c.metric)}
            className={cn(
              'group rounded-2xl border border-border/30 bg-foreground/[0.02] p-4 text-left transition-colors',
              'hover:border-border/60 hover:bg-foreground/[0.04]',
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">{c.label}</p>
              <c.icon className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{nf.format(c.value)}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground/50">{c.hint}</p>
          </button>
        ))}
      </section>

      {/* Shared range selector */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t('trendsTitle')}</h2>
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

      {/* Inline charts, one per metric */}
      <div className="mt-3 space-y-3">
        {cards.map((c) => (
          <MetricChartBlock
            key={c.metric}
            ref={(el) => { chartRefs.current[c.metric] = el; }}
            title={t(`metric_${c.metric}`)}
            desc={t(`metric_${c.metric}_desc`)}
            points={series[c.metric]}
          />
        ))}
      </div>
    </>
  );
}

const MetricChartBlock = ({
  ref,
  title,
  desc,
  points,
}: {
  ref: (el: HTMLDivElement | null) => void;
  title: string;
  desc: string;
  points: SeriesPoint[] | null | undefined;
}) => {
  const t = useT('admin');
  const vals = points?.map((p) => p.v) ?? [];
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const latest = vals.length ? vals[vals.length - 1]! : 0;

  return (
    <section ref={ref} className="scroll-mt-4 rounded-2xl border border-border/30 bg-foreground/[0.02] p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground/60">{desc}</p>
        </div>
        {points && points.length > 0 && (
          <div className="flex gap-3 text-right text-xs tabular-nums text-muted-foreground">
            <span title={t('sumLatest')}><span className="text-foreground">{latest}</span> {t('sumLatest').toLowerCase()}</span>
            <span title={t('sumMin')}>{min}–{max}</span>
            <span title={t('sumAvg')}>~{avg}</span>
          </div>
        )}
      </div>

      {points === undefined ? (
        <div className="h-[180px] animate-pulse rounded-xl bg-foreground/[0.03]" />
      ) : points && points.length > 0 ? (
        <TimeSeriesChart data={points} />
      ) : (
        <div className="flex h-[140px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
          <p>{t('noHistory')}</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground/60">{t('noHistoryHint')}</p>
        </div>
      )}
    </section>
  );
};
