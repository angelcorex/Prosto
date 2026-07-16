'use client';

/**
 * Tiny event bus that lets any detail screen (a channel header, a chat header)
 * open the shell's off-canvas navigation drawer without importing AppShell or
 * threading callbacks through the tree. The shell owns the drawer state and
 * subscribes; screens just call `openNavDrawer()` from a visible button, so the
 * drawer is discoverable on touch (not swipe-only).
 */

const OPEN_EVENT = 'prosto:nav-drawer:open';

/** Ask the shell to open the navigation drawer. No-op during SSR. */
export function openNavDrawer(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Subscribe to open requests. Returns an unsubscribe function. */
export function onNavDrawerOpen(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const fn = () => handler();
  window.addEventListener(OPEN_EVENT, fn);
  return () => window.removeEventListener(OPEN_EVENT, fn);
}
