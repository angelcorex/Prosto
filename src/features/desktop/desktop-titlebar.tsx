'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

import { site } from '@/config';

const DRAG: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * Custom window title bar for the Prosto desktop client (Discord-style).
 *
 * Renders nothing in a normal browser. Inside the desktop shell it shows a slim
 * draggable bar with the three native window controls (minimize / maximize /
 * close), styled with the app's own tokens. Adds `desktop-chrome` to <html> so
 * globals.css reserves the 32px it occupies.
 */
export function DesktopTitlebar() {
  const [ready, setReady] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const d = window.prostoDesktop;
    if (!d?.isDesktop) return;

    // Drop the desktop loading splash as soon as ANY page has painted — this
    // fires on the landing/sign-in routes too, not just the authenticated
    // AppShell. Previously only AppShell called signalReady(), so an unauthed
    // launch (→ redirect to /sign-in) left the splash hanging until the 8s
    // failsafe. Guarded by isDesktop, so it's a no-op in a normal browser.
    try { d.signalReady?.(); } catch { /* ignore */ }

    // In a popout widget window there's no title bar — the widget has its own.
    if (new URLSearchParams(window.location.search).get('widget') === '1') return;

    document.documentElement.classList.add('desktop-chrome');
    setReady(true);
    d.window.isMaximized().then(setMaximized).catch(() => {});
    const off = d.window.onMaximizeChange(setMaximized);

    return () => {
      off?.();
      document.documentElement.classList.remove('desktop-chrome');
    };
  }, []);

  if (!ready) return null;
  const win = window.prostoDesktop!.window;

  return (
    <div
      style={DRAG}
      className="fixed inset-x-0 top-0 z-[100] flex h-8 select-none items-center justify-between border-b border-border/20 bg-background/95 pl-3 backdrop-blur"
    >
      <span className="flex items-center gap-2 text-[12px] font-semibold tracking-tight text-muted-foreground">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon/prosto_logo.png" alt="" className="h-4 w-4" />
        {site.name}
      </span>

      <div style={NO_DRAG} className="flex h-full">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => win.minimize()}
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={() => win.toggleMaximize()}
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => win.close()}
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
