'use client';

import { useEffect } from 'react';

import { IosInstallHint } from './ios-install-hint';

/**
 * Registers the service worker and flags standalone (installed) sessions so
 * the shell can respect iOS safe areas. Skipped inside the desktop client.
 */
export function PwaProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.prostoDesktop?.isDesktop) return;

    // Mark installed (home-screen) sessions for safe-area padding.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari exposes this non-standard flag in standalone mode.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) document.documentElement.classList.add('pwa-standalone');

    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
        if (document.readyState === 'complete') register();
        else window.addEventListener('load', register, { once: true });
      } else {
        // In dev a cached SW can serve stale chunks → hydration mismatch. Purge it.
        navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
        if ('caches' in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
    }

    // iOS Safari ignores user-scalable=no — block pinch/double-tap zoom directly.
    const preventGesture = (e: Event) => e.preventDefault();
    let lastTouchEnd = 0;
    const preventDoubleTap = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    };
    document.addEventListener('gesturestart', preventGesture);
    document.addEventListener('gesturechange', preventGesture);
    document.addEventListener('touchend', preventDoubleTap, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('touchend', preventDoubleTap);
    };
  }, []);

  return <IosInstallHint />;
}
