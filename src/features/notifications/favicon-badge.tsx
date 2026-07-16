'use client';

import { useFaviconBadge } from './use-favicon-badge';

/**
 * Headless mount that keeps the browser/tab favicon in sync with unread state.
 * Renders nothing.
 */
export function FaviconBadge() {
  useFaviconBadge();
  return null;
}
