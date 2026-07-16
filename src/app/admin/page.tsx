import { Users, MessagesSquare, FileText, Server } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n';
import { StatCard, SignupsChart, DashboardMetrics } from '@/features/admin';
import type { AdminStats, SignupPoint } from '@/features/admin';

// Metrics are live counts — never cache this page.
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const t = await getT('admin');
  const supabase = await createClient();

  const [{ data: stats }, { data: series }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('admin_stats'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('admin_signups_series', { days: 30 }),
  ]);

  const s: AdminStats | null = stats ?? null;
  const points: SignupPoint[] = Array.isArray(series) ? series : [];
  const nf = new Intl.NumberFormat();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold">{t('dashboardTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboardSubtitle')}</p>
      </header>

      {/* Headline metrics — click a card to scroll to its history chart below. */}
      <DashboardMetrics stats={s} />

      <section className="mt-4 rounded-2xl border border-border/30 bg-foreground/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">{t('signupsTitle')}</h2>
          <span className="text-xs text-muted-foreground/50">{t('signupsRange')}</span>
        </div>
        <SignupsChart data={points} />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t('statPosts')} value={nf.format(s?.posts ?? 0)} icon={<FileText className="h-4 w-4" />} />
        <StatCard label={t('statMessages')} value={nf.format((s?.messages ?? 0) + (s?.channel_messages ?? 0))} icon={<MessagesSquare className="h-4 w-4" />} hint={`${t('statDms')}: ${nf.format(s?.messages ?? 0)}`} />
        <StatCard label={t('statServers')} value={nf.format(s?.servers ?? 0)} icon={<Server className="h-4 w-4" />} />
        <StatCard label={t('statRoles')} value={nf.format((s?.moderators ?? 0) + (s?.premium ?? 0))} icon={<Users className="h-4 w-4" />} hint={`${t('flagModerator')}: ${nf.format(s?.moderators ?? 0)} · ${t('flagPremium')}: ${nf.format(s?.premium ?? 0)}`} />
      </section>
    </div>
  );
}
