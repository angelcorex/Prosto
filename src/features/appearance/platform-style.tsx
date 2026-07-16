'use client';

import { useEffect, useState } from 'react';

export type PlatformStyle = 'default' | 'glass';

const STORAGE_KEY = 'prosto:style';

/** Apply a style to the document root (data attribute drives the CSS). */
export function applyPlatformStyle(style: PlatformStyle) {
  if (typeof document === 'undefined') return;
  if (style === 'glass') document.documentElement.setAttribute('data-app-style', 'glass');
  else document.documentElement.removeAttribute('data-app-style');
}

function readStored(): PlatformStyle {
  if (typeof window === 'undefined') return 'default';
  try { return (localStorage.getItem(STORAGE_KEY) as PlatformStyle) || 'default'; } catch { return 'default'; }
}

/** Read + set the current platform style (persisted, applied app-wide). */
export function usePlatformStyle() {
  const [style, setStyleState] = useState<PlatformStyle>('default');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setStyleState(readStored()); setMounted(true); }, []);

  function setStyle(next: PlatformStyle) {
    setStyleState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    applyPlatformStyle(next);
  }

  return { style, setStyle, mounted };
}

/** Mounted once at the app root — applies the stored style on every page. */
export function PlatformStyleProvider() {
  useEffect(() => { applyPlatformStyle(readStored()); }, []);
  return null;
}
