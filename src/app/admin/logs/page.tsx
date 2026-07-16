import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n';
import { EventsFeed } from '@/features/admin';
import type { AppEvent } from '@/features/admin';

export const dynamic = 'force-dynamic';

const VALID_LEVELS = new Set(['error', 'warn', 'info', 'debug']);

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const { level: raw } = await searchParams;
  const level = raw && VALID_LEVELS.has(raw) ? raw : '';
  const t = await getT('admin');
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('admin_recent_events', {
    p_level: level || null,
    lim: 200,
  });
  const events: AppEvent[] = Array.isArray(data) ? data : [];

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold">{t('navLogs')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('logsSubtitle')}</p>
      </header>
      <EventsFeed events={events} activeLevel={level} />
    </div>
  );
}
