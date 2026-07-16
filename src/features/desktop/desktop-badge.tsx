'use client';

import { useDesktopBadge } from './use-desktop-badge';

/**
 * Headless mount point that syncs the desktop taskbar badge with unread state.
 * Renders nothing; only active inside the Prosto desktop client.
 */
export function DesktopBadge() {
  useDesktopBadge();
  return null;
}
