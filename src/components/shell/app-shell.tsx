'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils/cn';
import { TabBar, syncTab } from '@/features/tabs';
import { WidgetBar } from './widget-bar';
import { onNavDrawerOpen } from './drawer-bus';

interface AppShellProps {
  iconRail:        ReactNode;
  dmSidebar:       ReactNode;
  rightPanel:      ReactNode;
  serverSidebar?:  ReactNode;
  serverRightPanel?: ReactNode;
  mobileNav?:      ReactNode;
  /** Account panel pinned to the bottom, spanning the rail + sidebar columns. */
  userPanel?:      ReactNode;
  children:        ReactNode;
}

/** Clears the floating bottom bar. Single source of truth is `--bottom-nav-space`
 *  (globals.css) via the `pb-bottom-nav` utility — the bar height and this
 *  clearance can never drift apart. Zeroed at md+ (no bottom bar there). */
const BAR_PAD = 'pb-bottom-nav';

/**
 * Responsive application shell.
 *
 * Desktop: icon rail · context sidebar · content · right panel (static row).
 * Mobile : a Bluesky-style bottom bar navigates. The chats/channel-list screen
 * shows the server rail + list on the left (like desktop). On content screens
 * the content is full-screen and a swipe to the right reveals the nav drawer.
 *
 * The mobile drawer is rendered through a portal on `document.body` so it sits
 * in the page's top-level stacking context — this avoids iOS Safari compositing
 * bugs where a chat header with `backdrop-filter` paints over a `fixed` sibling.
 */
export function AppShell({ iconRail, dmSidebar, rightPanel, serverSidebar, serverRightPanel, mobileNav, userPanel, children }: AppShellProps) {
  const pathname = usePathname();
  const [drawer, setDrawer]   = useState(false);
  const [mounted, setMounted] = useState(false);
  // Read isDesktop synchronously on first client render to avoid the
  // hydration flash where nav is hidden then jumps into view.
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true; // SSR: assume desktop
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [widget, setWidget] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isWidget = new URLSearchParams(window.location.search).get('widget') === '1';
    setWidget(isWidget);
    if (isWidget) document.documentElement.classList.add('widget-mode');
    // Note: dropping the desktop splash (signalReady) is handled globally in
    // DesktopTitlebar (mounted in the root layout) so it fires on every route,
    // including the unauthenticated landing/sign-in screens.
    return () => document.documentElement.classList.remove('widget-mode');
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    // No need to call update() immediately — useState already reads it.
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const inServer  = pathname.startsWith('/s/');
  const inChannel = /^\/s\/[^/]+\/[^/]+/.test(pathname);
  const inConversation = /^\/messages\/[^/]+/.test(pathname);
  const inDetail  = inConversation || inChannel;
  // "List" screens show the rail + sidebar full-screen on mobile.
  const showList = (pathname === '/messages') || (inServer && !inChannel);
  const padForBar = !inDetail; // bottom bar is visible here

  const sidebar = inServer ? serverSidebar : dmSidebar;
  const right   = inServer ? serverRightPanel : rightPanel;

  useEffect(() => { setDrawer(false); }, [pathname]);

  // Keep the browser-style tab strip in sync with the current route.
  useEffect(() => { syncTab(pathname); }, [pathname]);

  // A visible button on detail screens (channel/chat headers) can open the
  // drawer via this bus, so navigation isn't swipe-only on touch.
  useEffect(() => onNavDrawerOpen(() => setDrawer(true)), []);

  // Mobile detail screens use the off-canvas portal drawer; everything else
  // (desktop, or the list screens) lays the nav group out inline.
  const useDrawerMode = mounted && !isDesktop && !showList;

  // Swipe right opens the nav drawer (content/detail screens); left closes it.
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]; if (!t) return;
    startX.current = t.clientX; startY.current = t.clientY;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null) return;
    const t = e.changedTouches[0]; if (!t) { startX.current = null; return; }
    const dx = t.clientX - startX.current;
    const dy = Math.abs(t.clientY - (startY.current ?? 0));
    startX.current = null; startY.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < dy * 1.5) return;
    if (dx > 0) { if (!showList) setDrawer(true); }
    else setDrawer(false);
  }

  // Reusable nav group pieces (rail + contextual sidebar).
  const railAside = (
    <aside className="flex h-full w-[64px] shrink-0 flex-col border-r border-border/20 bg-background md:w-[72px]">
      {iconRail}
    </aside>
  );
  const sidebarAside = (variant: 'list' | 'drawer') => (
    <aside
      className={cn(
        'flex h-full min-w-0 shrink-0 flex-col border-r border-border/20 md:w-[280px] md:flex-none',
        variant === 'list' ? 'flex-1 bg-card/40' : 'w-[80vw] max-w-[340px] bg-background',
      )}
    >
      {sidebar}
    </aside>
  );

  // Rail + sidebar on top, the account panel spanning both columns at the
  // bottom (Discord-style account bar, but stretched under the server rail too).
  const navGroup = (variant: 'list' | 'drawer') => (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {railAside}
        {sidebarAside(variant)}
      </div>
      {userPanel && (
        <div className={cn(
          'col-edge shrink-0 border-r border-border/20 bg-background',
          variant === 'list' && padForBar
            ? BAR_PAD
            : 'pb-[env(safe-area-inset-bottom)] md:pb-0',
        )}>
          {userPanel}
        </div>
      )}
    </div>
  );

  // Floating widget window (desktop popout): render only the chat, no chrome.
  if (widget) {
    return (
      <div className="widget-root flex h-dvh w-full flex-col overflow-hidden bg-background/90">
        <WidgetBar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="pwa-safe relative flex h-dvh w-full flex-col overflow-hidden">
      {/* Browser-style tabs (desktop) */}
      <TabBar />

      <div
        className="relative flex min-h-0 w-full flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
      {/* Inline navigation group: desktop always, plus the mobile list screen */}
      {!useDrawerMode && (
        <div className={cn('flex shrink-0', showList ? 'relative w-full md:w-auto' : 'hidden md:flex')}>
          {navGroup(showList ? 'list' : 'drawer')}
        </div>
      )}

      {/* Main content */}
      <main
        className={cn(
          'min-w-0 flex-1 flex-col overflow-y-auto',
          showList ? 'hidden md:flex' : 'flex',
          !showList && padForBar && BAR_PAD,
        )}
      >
        {children}
      </main>

      {/* Right panel (desktop) */}
      <aside className="hidden h-full w-[300px] shrink-0 flex-col border-l border-border/20 xl:flex">
        {right}
      </aside>

      {/* Mobile bottom navigation */}
      {mobileNav}
      </div>

      {/* Off-canvas drawer (mobile detail screens) — portalled above everything */}
      {useDrawerMode && createPortal(
        <div
          className={cn('fixed inset-0 z-[120] md:hidden', drawer ? 'pointer-events-auto' : 'pointer-events-none')}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Dimmer */}
          <div
            className={cn('absolute inset-0 bg-black/60 transition-opacity duration-200', drawer ? 'opacity-100' : 'opacity-0')}
            onClick={() => setDrawer(false)}
          />
          {/* Sliding panel (opaque, covers the content beneath it) */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 flex bg-background pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-200 ease-out',
              drawer ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {navGroup('drawer')}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
