'use client';

import { useEffect } from 'react';

/**
 * Recovers the app when it references JS/CSS chunks from a PREVIOUS deploy.
 *
 * After a redeploy, `next build` regenerates content-hashed chunk filenames and
 * removes the old ones. A tab/window (web OR desktop) that was opened before the
 * deploy still runs the old build and, on navigation to a not-yet-loaded route
 * (e.g. /settings/profile, /friends), requests old chunk URLs that no longer
 * exist. The server answers those with its HTML not-found page
 * (`Content-Type: text/html`); because we send `X-Content-Type-Options:
 * nosniff`, the browser refuses to execute HTML as a script and the route dies
 * with the WebView/Firefox "This page couldn't load" error.
 *
 * Fix: when a static chunk fails to load (or a dynamic import throws a
 * ChunkLoadError), drop the (web-only) service-worker cache that pins the old
 * build and hard-reload ONCE so the client re-syncs to the live build. A short
 * loop guard prevents a reload storm if a fresh load still fails (e.g. an edge
 * cache is still serving stale HTML — that must be fixed at the CDN too).
 *
 * Runs in BOTH the web app and the desktop shell — unlike PwaProvider, which
 * skips the desktop client — because the stale-chunk problem is not SW-specific.
 */
export function ChunkReloadGuard() {
  useEffect(() => {
    const RELOAD_KEY = 'prosto:chunk-reload-at';
    const MIN_INTERVAL_MS = 30_000;

    // A failed <script>/<link> load points at a build chunk under /_next/static.
    function looksLikeChunkFailure(target: EventTarget | null): boolean {
      const el = target as HTMLScriptElement | HTMLLinkElement | null;
      if (!el) return false;
      const url =
        el instanceof HTMLScriptElement ? el.src :
        el instanceof HTMLLinkElement ? el.href :
        '';
      return typeof url === 'string' && url.includes('/_next/static/');
    }

    // Dynamic import() failures surface as a rejected promise / thrown error.
    function isChunkLoadError(reason: unknown): boolean {
      const msg = (reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason ?? '')).toLowerCase();
      return (
        msg.includes('chunkloaderror') ||
        msg.includes('loading chunk') ||
        msg.includes('loading css chunk') ||
        msg.includes('dynamically imported module')
      );
    }

    async function recover() {
      // Loop guard: at most one reload per interval, so a persistently broken
      // load (stale HTML still served by an edge cache) can never spin.
      let last = 0;
      try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* storage blocked */ }
      if (Date.now() - last < MIN_INTERVAL_MS) return;
      try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* storage blocked */ }

      // Drop the SW + its cache that pins the previous build so the reload
      // actually fetches the current build's chunks. No-ops in the desktop shell
      // (no SW there) and when the Cache API is unavailable.
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch { /* ignore */ }
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch { /* ignore */ }

      window.location.reload();
    }

    function onError(e: Event) {
      if (looksLikeChunkFailure(e.target)) void recover();
    }
    function onRejection(e: PromiseRejectionEvent) {
      if (isChunkLoadError(e.reason)) void recover();
    }

    // Capture phase: resource-load errors don't bubble to window otherwise.
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
