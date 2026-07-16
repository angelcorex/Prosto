'use client';

import { useEffect, useRef } from 'react';

interface UseScrollBehaviorOptions {
  /** Dependencies that should trigger an auto-scroll attempt (e.g. messages.length, typers). */
  scrollDeps: unknown[];
}

interface UseScrollBehaviorResult {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function useScrollBehavior({ scrollDeps }: UseScrollBehaviorOptions): UseScrollBehaviorResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Whether the viewport is pinned to the bottom. We only auto-scroll when it
  // is, so reading history is never yanked.
  const atBottomRef = useRef(true);
  const scrollHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll on new messages / typing changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, scrollDeps);

  // ResizeObserver: re-pin when content grows after layout (images, embeds…).
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  // Native <video> fullscreen: re-pin to bottom on exit so the browser's
  // scroll-into-view (which aligns to the video top) doesn't strand the user.
  useEffect(() => {
    let wasAtBottom = true;
    function onFsChange() {
      const el = scrollRef.current;
      if (!el) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
      if (fsEl) {
        wasAtBottom = atBottomRef.current;
        return;
      }
      if (!wasAtBottom) return;
      const pin = () => { el.scrollTop = el.scrollHeight; };
      requestAnimationFrame(() => { pin(); requestAnimationFrame(pin); });
      setTimeout(pin, 80);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange as EventListener);
    };
  }, []);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    el.classList.add('is-scrolling');
    if (scrollHideRef.current) clearTimeout(scrollHideRef.current);
    scrollHideRef.current = setTimeout(() => el.classList.remove('is-scrolling'), 900);
  }

  return { scrollRef, contentRef, onScroll };
}
