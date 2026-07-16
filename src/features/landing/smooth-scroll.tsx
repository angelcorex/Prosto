'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/**
 * Smooth momentum scrolling for the landing, powered by Lenis. Lenis normalises
 * wheel / trackpad / touch / keyboard input across browsers via a single rAF
 * loop, so scrolling feels the same everywhere (no per-browser jank or lag like
 * a hand-rolled wheel hijack). Mounts only on the landing and tears down on
 * navigate; respects `prefers-reduced-motion`.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic — quick, no floaty lag
      smoothWheel: true,
      touchMultiplier: 1.4,
    });

    // In-page anchor links (footer / nav → #feed etc.) scroll smoothly too.
    function onAnchorClick(e: MouseEvent) {
      const a = (e.target as HTMLElement)?.closest('a[href^="#"]') as HTMLAnchorElement | null;
      const id = a?.getAttribute('href')?.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -80 });
    }

    let raf = 0;
    function loop(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    document.addEventListener('click', onAnchorClick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('click', onAnchorClick);
      lenis.destroy();
    };
  }, []);

  return null;
}
