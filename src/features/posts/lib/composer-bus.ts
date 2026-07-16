'use client';

/**
 * Tiny event bus for the mobile full-screen composer. Any surface (the bottom
 * tab bar's compose button, a FAB, etc.) can call `openComposer()`; the
 * `MobileComposer` host listens for the event and slides up a full-screen
 * writing screen. Kept dependency-free (a plain CustomEvent on window) so it
 * never couples features together — the caller doesn't import the composer.
 */

const OPEN_EVENT = 'prosto:compose:open';

/** Request the mobile full-screen composer to open. No-op during SSR. */
export function openComposer(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Subscribe to open requests. Returns an unsubscribe function. */
export function onComposerOpen(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const fn = () => handler();
  window.addEventListener(OPEN_EVENT, fn);
  return () => window.removeEventListener(OPEN_EVENT, fn);
}
