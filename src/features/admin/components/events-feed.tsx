'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import type { AppEvent, AppEventLevel } from '../types';

const LEVELS: (AppEventLevel | 'all')[] = ['all', 'error', 'warn', 'info', 'debug'];

const LEVEL_TONE: Record<AppEventLevel, string> = {
  error: 'bg-destructive/15 text-destructive',
  warn:  'bg-amber-500/15 text-amber-500',
  info:  'bg-sky-500/15 text-sky-400',
  debug: 'bg-muted text-muted-foreground',
};

export function EventsFeed({ events, activeLevel }: { events: AppEvent[]; activeLevel: string }) {
  const t = useT('admin');
  const router = useRouter();
  const params = useSearchParams();

  function selectLevel(level: string) {
    const q = new URLSearchParams(params.toString());
    if (level === 'all') q.delete('level'); else q.set('level', level);
    router.replace(`/admin/logs?${q.toString()}`);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {LEVELS.map((lvl) => {
          const active = lvl === 'all' ? !activeLevel : activeLevel === lvl;
          return (
            <button
              key={lvl}
              type="button"
              onClick={() => selectLevel(lvl)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {t(`level_${lvl}`)}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/30">
        {events.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('noEvents')}</p>
        )}
        <ul className="divide-y divide-border/20">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span className={cn('mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', LEVEL_TONE[e.level])}>
                {e.level}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="font-mono text-xs text-muted-foreground/70">{e.kind}</span>
                  <span className="break-words text-foreground">{e.message}</span>
                </span>
                {e.path && <span className="block truncate text-xs text-muted-foreground/50">{e.path}</span>}
              </span>
              <time className="shrink-0 whitespace-nowrap text-xs text-muted-foreground/50" dateTime={e.created_at}>
                {new Date(e.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
