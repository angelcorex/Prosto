'use client';

import { useEffect } from 'react';

import { literalColors } from '@/config';

import { useUnreadDMs, useUnreadNotifications } from '@/features/notifications';

/**
 * Draw the taskbar overlay badge to a PNG data URL.
 *  - `label` null → a small red dot (a plain notification).
 *  - `label` string → a red circle with the count (e.g. "3" or "9+").
 */
function drawBadge(label: string | null): string | null {
  if (typeof document === 'undefined') return null;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = literalColors.badge;

  if (label === null) {
    // Dot — centered, ~⅓ of the icon.
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Full circle + count.
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = literalColors.badgeForeground;
    ctx.font = `bold ${label.length > 1 ? 17 : 21}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size / 2 + 1);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Keeps the desktop taskbar icon's overlay badge in sync with unread state.
 * No-op in a normal browser. Priority: unread DM count → notification dot → clear.
 */
export function useDesktopBadge() {
  const dms = useUnreadDMs();
  const notifications = useUnreadNotifications();

  const dmTotal = dms.reduce((sum, dm) => sum + (dm.count || 0), 0);

  useEffect(() => {
    const desktop = window.prostoDesktop;
    if (!desktop?.isDesktop) return;

    if (dmTotal > 0) {
      const label = dmTotal > 9 ? '9+' : String(dmTotal);
      const url = drawBadge(label);
      if (url) desktop.setBadge(url, `${dmTotal}`);
    } else if (notifications > 0) {
      const url = drawBadge(null);
      if (url) desktop.setBadge(url, '•');
    } else {
      desktop.clearBadge();
    }
  }, [dmTotal, notifications]);
}
