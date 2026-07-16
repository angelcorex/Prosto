import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Application logger.
 *
 * Two sinks:
 *  1. Always → the console (picked up by pm2 on the VPS).
 *  2. For NOTABLE events (errors, admin actions, auth) → the `app_events`
 *     table, so the admin panel can show a live feed. Routine request logs stay
 *     in the console only, to avoid write amplification on Postgres.
 *
 * Server-only. Persisting uses the service-role client (bypasses RLS) — never
 * import this into client code. Persistence is best-effort and fully swallowed:
 * logging must never break the request path it's observing.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level?: LogLevel;
  kind: string;           // 'auth' | 'upload' | 'moderation' | 'admin-action' | …
  message: string;
  userId?: string | null;
  path?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Kinds worth persisting to the DB regardless of level. Everything else is
 * persisted only when its level is warn/error (see `shouldPersist`).
 */
const PERSIST_KINDS = new Set(['auth', 'admin-action', 'moderation', 'upload', 'security']);

function shouldPersist(level: LogLevel, kind: string): boolean {
  if (level === 'warn' || level === 'error') return true;
  return PERSIST_KINDS.has(kind);
}

function toConsole(level: LogLevel, e: LogEvent) {
  const prefix = `[${e.kind}]`;
  const line = e.path ? `${prefix} ${e.message} (${e.path})` : `${prefix} ${e.message}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (e.meta && Object.keys(e.meta).length > 0) fn(line, e.meta);
  else fn(line);
}

export async function logEvent(event: LogEvent): Promise<void> {
  const level = event.level ?? 'info';
  toConsole(level, event);

  if (!shouldPersist(level, event.kind)) return;

  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('app_events').insert({
      level,
      kind: event.kind,
      message: event.message.slice(0, 2000),
      user_id: event.userId ?? null,
      path: event.path ?? null,
      meta: event.meta ?? {},
    });
  } catch (err) {
    // Never let logging failures surface — just note it on the console.
    if (process.env.NODE_ENV === 'development') console.error('[log] persist failed', err);
  }
}

/**
 * Time an async operation and log its duration. Records a warn/error event when
 * the operation throws (and re-throws), an info event on success. Use around
 * critical RPCs/actions to get observability without hand-writing timers.
 *
 *   const result = await withTiming('moderation', 'ban_user', () => banUser(id));
 */
export async function withTiming<T>(
  kind: string,
  label: string,
  fn: () => Promise<T>,
  opts?: { userId?: string | null; path?: string | null },
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    void logEvent({
      level: 'info',
      kind,
      message: `${label} ok`,
      userId: opts?.userId,
      path: opts?.path,
      meta: { ms: Date.now() - started },
    });
    return result;
  } catch (err) {
    void logEvent({
      level: 'error',
      kind,
      message: `${label} failed: ${err instanceof Error ? err.message : String(err)}`,
      userId: opts?.userId,
      path: opts?.path,
      meta: { ms: Date.now() - started },
    });
    throw err;
  }
}
