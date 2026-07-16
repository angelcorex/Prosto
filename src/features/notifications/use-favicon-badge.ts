'use client';

import { useEffect } from 'react';

import { literalColors } from '@/config';

import { useUnreadDMs } from './use-unread-dms';
import { useUnreadNotifications } from './use-unread';

const FALLBACK_SRC = '/favicon/prosto_icon.ico';

// Cached across renders/instances.
let baseImg: HTMLImageElement | null = null;
let baseImgSrc: string | null = null;
let originalHref: string | null = null;

/**
 * Dynamic favicon (browser tab + window icon).
 *
 * Draws the *original* favicon at its normal size and only adds a small badge
 * on top — a red count bubble (up to 9+) for unread DMs, or a dot for a plain
 * notification. The base icon is never resized/zoomed. Restores the untouched
 * favicon when everything is read.
 */
export function useFaviconBadge() {
  const dms = useUnreadDMs();
  const notifications = useUnreadNotifications();
  const dmTotal = dms.reduce((sum, dm) => sum + (dm.count || 0), 0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let cancelled = false;

    function getIconLink(): HTMLLinkElement {
      let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      if (originalHref === null) originalHref = link.getAttribute('href');
      return link;
    }

    const link = getIconLink();

    // Nothing unread → restore the original favicon untouched.
    if (dmTotal <= 0 && notifications <= 0) {
      if (originalHref) link.href = originalHref;
      return;
    }

    function render(img: HTMLImageElement) {
      if (cancelled) return;
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw the base icon at full size — identical to how the browser shows
      // it, so there's no zoom/resize when the badge appears.
      ctx.clearRect(0, 0, size, size);
      try {
        ctx.drawImage(img, 0, 0, size, size);
      } catch {
        return;
      }

      const hasDM = dmTotal > 0;
      const r = hasDM ? size * 0.3 : size * 0.18;
      const cx = size - r - 1;
      const cy = r + 1;

      // White outline so the badge reads against any icon.
      ctx.fillStyle = literalColors.badgeForeground;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = literalColors.badge;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      if (hasDM) {
        const label = dmTotal > 9 ? '9+' : String(dmTotal);
        ctx.fillStyle = literalColors.badgeForeground;
        ctx.font = `bold ${label.length > 1 ? 22 : 28}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy + 1);
      }

      link.href = canvas.toDataURL('image/png');
    }

    const src = originalHref || FALLBACK_SRC;
    if (baseImg && baseImgSrc === src && baseImg.complete) {
      render(baseImg);
    } else {
      const img = new Image();
      img.onload = () => {
        baseImg = img;
        baseImgSrc = src;
        render(img);
      };
      img.src = src;
    }

    return () => {
      cancelled = true;
    };
  }, [dmTotal, notifications]);
}
