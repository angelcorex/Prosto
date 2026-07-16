import { Clock, Monitor, Server as ServerIcon, Signal } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n';
import { env } from '@/lib/utils/env';
import { StatCard, DbHealth, LatencyHistory } from '@/features/admin';
import type { DbHealthData } from '@/features/admin';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Colour a latency reading green/amber/red by rough thresholds (ms). */
function latencyTone(ms: number | null): string {
  if (ms == null) return 'text-muted-foreground';
  if (ms < 100) return 'text-emerald-400';
  if (ms < 400) return 'text-amber-500';
  return 'text-destructive';
}

/** Time an async probe end-to-end; null on failure. */
async function probe(fn: () => Promise<unknown>): Promise<number | null> {
  const start = Date.now();
  try { await fn(); return Date.now() - start; } catch { return null; }
}

/** Node event-loop lag: how late a zero-delay timer actually fires. */
function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = Date.now();
    setTimeout(() => resolve(Math.max(0, Date.now() - start)), 0);
  });
}

export default async function AdminSystemPage() {
  const t = await getT('admin');
  const supabase = await createClient();

  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
  const uptime = fmtUptime(process.uptime());

  // Time the heavy health query on its own — it sums relation sizes over every
  // table, so it's NOT representative of normal query speed (shown as its own
  // metric, not "DB latency").
  const healthStart = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: healthRaw, error: healthErr } = await (supabase as any).rpc('admin_health');
  const healthMs = healthErr ? null : Date.now() - healthStart;
  const health: DbHealthData | null = healthRaw ?? null;

  // Latency probes (run in parallel):
  //  • gateway  — bare PostgREST RPC round-trip, no query cost (admin_ping).
  //  • dbQuery  — a LIGHT indexed single-row read (admin_db_probe): the honest
  //               "typical query" latency, unlike the heavy health query above.
  //  • media    — HEAD to the storage origin (object CDN reachability).
  //  • eventLag — Node event-loop lag (how backed-up this process is).
  const storageBase = (() => { try { return env.storage.publicUrl; } catch { return ''; } })();
  const [gatewayMs, dbQueryMs, mediaMs, eventLagMs, { data: stats }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    probe(() => (supabase as any).rpc('admin_ping')),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    probe(() => (supabase as any).rpc('admin_db_probe')),
    storageBase
      ? probe(() => fetch(storageBase, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(4000) }))
      : Promise.resolve(null),
    measureEventLoopLag(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('admin_stats'),
  ]);
  const liveSessions = stats?.online ?? 0;

  const latencies = [
    { label: t('latGateway'), value: gatewayMs, hint: t('latGatewayHint') },
    { label: t('latDbQuery'), value: dbQueryMs, hint: t('latDbQueryHint') },
    { label: t('latMedia'), value: mediaMs, hint: t('latMediaHint') },
    { label: t('latEventLoop'), value: eventLagMs, hint: t('latEventLoopHint') },
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold">{t('navSystem')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('systemSubtitle')}</p>
      </header>

      {/* Node process vitals */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t('sysVersion')} value={`v${pkg.version}`} icon={<Monitor className="h-4 w-4" />} hint={process.version} />
        <StatCard label={t('sysUptime')} value={uptime} icon={<Clock className="h-4 w-4" />} hint={t('sysUptimeHint')} />
        <StatCard label={t('sysMemory')} value={`${rssMb} MB`} icon={<ServerIcon className="h-4 w-4" />} hint={`heap ${heapMb} MB`} />
        <StatCard label={t('sysOnline')} value={liveSessions} icon={<Signal className="h-4 w-4" />} hint={t('sysOnlineHint')} />
      </section>

      {/* Latency probes */}
      <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">{t('latTitle')}</h2>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {latencies.map((l) => (
          <div key={l.label} className="rounded-2xl border border-border/30 bg-foreground/[0.02] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">{l.label}</p>
            <p className={`mt-2 text-lg font-semibold tabular-nums ${latencyTone(l.value)}`}>
              {l.value == null ? '—' : `${l.value} ms`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground/50">{l.hint}</p>
          </div>
        ))}
      </section>

      {/* Latency history charts (gateway + DB query over time) */}
      <div className="mt-6">
        <LatencyHistory />
      </div>

      {/* Database + infrastructure */}
      <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">{t('dbTitle')}</h2>
      <DbHealth health={health} latencyMs={dbQueryMs} healthMs={healthMs} />

      <p className="mt-6 text-xs text-muted-foreground/50">{t('systemNote')}</p>
    </div>
  );
}
