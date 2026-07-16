'use client';

import { usePresence } from './use-presence-store';
import { StatusDot } from './status-dot';

/**
 * Status dot that stays in sync with the shared realtime presence store.
 * Seed it with the SSR status/last_seen to avoid any flicker.
 */
export function LiveStatusDot({
  id,
  status,
  lastSeen,
  className,
}: {
  id: string;
  status?: string | null;
  lastSeen?: string | null;
  className?: string;
}) {
  const live = usePresence(id, status, lastSeen);
  return <StatusDot status={live.status} lastSeen={live.last_seen} className={className} />;
}
