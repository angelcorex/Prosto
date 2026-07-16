'use client';

import { useCallback, useRef, useState } from 'react';

import { rateLimits, type RateLimitKey } from '@/config';

export type RateGate =
  /** Allowed now (possibly after waiting `waitMs` to smooth out bursts). */
  | { ok: true; waitMs: number }
  /** Hard cap hit — caller should show the wait popup and not send. */
  | { ok: false; waitMs: number };

/**
 * Client-side anti-spam throttle.
 *
 * Mirrors the server hard limit but kicks in earlier and more gently:
 *  - under `softMax` in the window → instant.
 *  - past `softMax` → an escalating per-action delay (the faster you go, the
 *    longer each send waits).
 *  - at `hardMax` → blocked for `blockMs`; the caller surfaces a popup.
 *
 * The actual delay/await is left to the caller so it can show pending UI.
 */
export function useRateLimit(key: RateLimitKey) {
  const cfg = rateLimits[key];
  const stamps = useRef<number[]>([]);
  const blockUntil = useRef(0);
  const [blockedFor, setBlockedFor] = useState(0);

  const acquire = useCallback((): RateGate => {
    const now = Date.now();

    if (now < blockUntil.current) {
      const waitMs = blockUntil.current - now;
      setBlockedFor(waitMs);
      return { ok: false, waitMs };
    }

    // Drop stamps that fell out of the window.
    stamps.current = stamps.current.filter((t) => now - t < cfg.windowMs);
    const count = stamps.current.length;

    if (count >= cfg.hardMax) {
      blockUntil.current = now + cfg.blockMs;
      setBlockedFor(cfg.blockMs);
      return { ok: false, waitMs: cfg.blockMs };
    }

    let waitMs = 0;
    if (count >= cfg.softMax) {
      waitMs = Math.min(cfg.maxDelayMs, (count - cfg.softMax + 1) * cfg.stepMs);
    }

    stamps.current.push(now + waitMs);
    return { ok: true, waitMs };
  }, [cfg]);

  const clearBlock = useCallback(() => setBlockedFor(0), []);

  return { acquire, blockedFor, clearBlock };
}
