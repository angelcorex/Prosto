'use client';

import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

/**
 * Opaque full-screen loader shown while an account switch is in flight and the
 * page hard-reloads, so the previous account's content never flashes on screen
 * during the transition. Rendered above every modal/popover.
 */
export function AccountSwitchOverlay() {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>,
    document.body,
  );
}
