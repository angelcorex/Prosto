'use client';

import { type CSSProperties } from 'react';
import { X } from 'lucide-react';

const DRAG: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * Invisible drag strip for the floating chat widget window. Provides a drag
 * handle (frameless window can be moved) and a close button that only appears
 * on hover — so the widget reads as "just the chat", no visible chrome.
 */
export function WidgetBar() {
  const close = () => {
    if (window.prostoDesktop?.window) window.prostoDesktop.window.close();
    else window.close();
  };

  return (
    <div
      style={DRAG}
      className="group/wbar relative flex h-6 shrink-0 items-center justify-end bg-transparent px-1"
    >
      <button
        type="button"
        style={NO_DRAG}
        aria-label="Close"
        onClick={close}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive hover:text-white group-hover/wbar:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
