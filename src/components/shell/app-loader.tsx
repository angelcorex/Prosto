'use client';

import { useEffect, type ReactNode } from 'react';

import { loadMart } from '@/components/ui/emoji-picker';

/**
 * Warms non-critical resources in the background WITHOUT blocking first paint.
 *
 * The app shell is server-rendered, so we render {children} immediately and
 * warm the emoji dataset during idle time. Nothing here gates the UI: the
 * emoji picker self-loads the dataset on open, so a slow/failed warm-up only
 * means the first picker open does its own fetch — it never delays the feed,
 * chats or profiles.
 *
 * NOTE: the user's servers + each server's custom emojis are already fetched
 * and registered by <ServerRail> on mount. We deliberately do NOT duplicate
 * that here — doing so fired `get_my_servers` twice and warmed every server's
 * emojis twice on every load, competing with hydration for no benefit.
 */
export function AppLoader({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    // The emoji dataset is a sizeable JSON chunk. Defer it to idle so the
    // download never competes with first paint / hydration; it's a cached
    // dynamic import, and the picker also self-loads it on open, so being a
    // moment late here is invisible.
    const warm = () => { if (!cancelled) void loadMart(); };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => number);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cic = (window as any).cancelIdleCallback as undefined | ((h: number) => void);
    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (ric) idleHandle = ric(warm);
    else timeoutHandle = setTimeout(warm, 200);

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && cic) cic(idleHandle);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    };
  }, []);

  return <>{children}</>;
}
