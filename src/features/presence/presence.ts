export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

// Considered online if seen within this window. Generous on purpose: browsers
// heavily throttle background-tab timers, so a tight window would flip an open
// (but hidden) app to "offline". As long as any tab/app is open and beating,
// the user stays online.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Resolve the effective status from stored status + last_seen. */
export function effectiveStatus(status: string | null | undefined, lastSeen: string | null | undefined): PresenceStatus {
  const s = (status ?? 'offline') as PresenceStatus;
  if (s === 'offline') return 'offline';            // invisible / manually offline
  if (!lastSeen) return 'offline';
  const seen = new Date(lastSeen).getTime();
  if (Date.now() - seen > ONLINE_WINDOW_MS) return 'offline';
  return s; // online / idle / dnd
}

export const STATUS_COLOR: Record<PresenceStatus, string> = {
  online:  'bg-success',
  idle:    'bg-warning',
  dnd:     'bg-destructive',
  offline: 'bg-muted-foreground',
};

/** Human "last seen" string. */
export function lastSeenLabel(
  lastSeen: string | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
  locale: string,
): string {
  if (!lastSeen) return t('offline');
  const diffMs = Date.now() - new Date(lastSeen).getTime();
  const min  = Math.floor(diffMs / 60000);
  if (min < 1)   return t('lastSeenNow');
  if (min < 60)  return t('lastSeenMinutes', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('lastSeenHours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7)  return t('lastSeenDays', { n: days });
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(lastSeen));
}
