'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * Scroll-reveal wrapper. The child starts hidden and animates in (a subtle
 * zoom + rise) the first time it scrolls into view — used across the public
 * landing to make sections appear smoothly as you scroll. Runs once per node.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger the entrance (ms) — e.g. cascade cards in a grid. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Fallback for environments without IntersectionObserver: just show it.
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      className={cn('reveal', shown && 'reveal-in', className)}
    >
      {children}
    </div>
  );
}
