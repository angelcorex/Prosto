'use client';

import { useHeartbeat } from './use-heartbeat';

/** Mounted once in the app shell to keep presence fresh. */
export function HeartbeatMount() {
  useHeartbeat();
  return null;
}
