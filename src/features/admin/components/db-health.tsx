import { getT } from '@/lib/i18n';
import { formatBytes } from '@/lib/utils/media';
import type { DbHealth } from '../types';

/**
 * Postgres + storage vitals for the System page. Server-rendered (no client
 * hooks): the parent page fetches `admin_health()` and passes it in along with
 * the measured round-trip latency to the DB.
 */
export async function DbHealth({
  health,
  latencyMs,
  healthMs,
}: {
  health: DbHealth | null;
  latencyMs: number | null;
  healthMs?: number | null;
}) {
  const t = await getT('admin');

  if (!health) {
    return <p className="text-sm text-muted-foreground">{t('dbUnavailable')}</p>;
  }

  const nf = new Intl.NumberFormat();
  const cachePct = Math.round((health.cache_hit_ratio ?? 0) * 1000) / 10;
  const connPct = health.connections_max
    ? Math.round((health.connections_active / health.connections_max) * 100)
    : 0;

  // Postgres uptime from postmaster start.
  const startedMs = new Date(health.db_started_at).getTime();
  const nowMs = new Date(health.now).getTime();
  const upSecs = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const upDays = Math.floor(upSecs / 86400);
  const upHours = Math.floor((upSecs % 86400) / 3600);
  const dbUptime = upDays > 0 ? `${upDays}d ${upHours}h` : `${upHours}h ${Math.floor((upSecs % 3600) / 60)}m`;

  const version = (health.postgres_version || '').split(' ')[0] || '—';
  const tables = [...(health.tables ?? [])].sort((a, b) => b.total_bytes - a.total_bytes);
  const maxBytes = Math.max(1, ...tables.map((tbl) => tbl.total_bytes));

  const latencyTone =
    latencyMs == null ? 'text-muted-foreground'
    : latencyMs < 80 ? 'text-emerald-400'
    : latencyMs < 250 ? 'text-amber-500'
    : 'text-destructive';

  return (
    <div className="space-y-4">
      {/* Vitals grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label={t('dbLatency')} value={latencyMs == null ? '—' : `${latencyMs} ms`} valueClass={latencyTone} hint={t('dbLatencyHint')} />
        <Metric label={t('dbVersion')} value={`PG ${version}`} hint="PostgreSQL" />
        <Metric label={t('dbSize')} value={formatBytes(health.db_size_bytes)} hint={t('dbSizeHint')} />
        <Metric label={t('dbHealthQuery')} value={healthMs == null ? '—' : `${healthMs} ms`} hint={t('dbHealthQueryHint')} />
      </div>
      <p className="-mt-1 text-xs text-muted-foreground/40">{t('dbUptimeLabel')}: {dbUptime}</p>

      {/* Connections + cache — bars */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border/30 bg-foreground/[0.02] p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">{t('dbConnections')}</p>
            <p className="text-sm font-semibold tabular-nums">{health.connections_active}<span className="text-muted-foreground/50"> / {health.connections_max}</span></p>
          </div>
          <Bar pct={connPct} tone={connPct > 85 ? 'bg-destructive' : connPct > 60 ? 'bg-amber-500' : 'bg-primary'} />
          <p className="mt-1 text-xs text-muted-foreground/50">{t('dbConnectionsHint')}</p>
        </div>

        <div className="rounded-2xl border border-border/30 bg-foreground/[0.02] p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">{t('dbCache')}</p>
            <p className="text-sm font-semibold tabular-nums">{cachePct}%</p>
          </div>
          <Bar pct={cachePct} tone={cachePct > 99 ? 'bg-emerald-400' : cachePct > 90 ? 'bg-primary' : 'bg-amber-500'} />
          <p className="mt-1 text-xs text-muted-foreground/50">{t('dbCacheHint')}</p>
        </div>
      </div>

      {/* Per-table breakdown */}
      <div className="rounded-2xl border border-border/30 bg-foreground/[0.02] p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">{t('dbTables')}</p>
        <ul className="space-y-2">
          {tables.map((tbl) => (
            <li key={tbl.name}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-mono text-xs text-foreground">{tbl.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {nf.format(tbl.rows)} <span className="text-muted-foreground/40">·</span> {formatBytes(tbl.total_bytes)}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.max(2, (tbl.total_bytes / maxBytes) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value, hint, valueClass }: { label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-border/30 bg-foreground/[0.02] p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <p className={`mt-2 text-lg font-semibold tabular-nums ${valueClass ?? 'text-foreground'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground/50">{hint}</p>}
    </div>
  );
}

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
