'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';

/**
 * "Slow down" cooldown modal.
 *
 * Centered overlay shown while the anti-spam cooldown is active. Re-triggered
 * on every blocked send attempt; the countdown reflects the remaining wait.
 */
export function RateLimitPopup({
  durationMs,
  onDismiss,
}: {
  durationMs: number;
  /** Hide the modal (cooldown keeps running in the background). */
  onDismiss: () => void;
}) {
  const t = useT('messages.cooldown');
  const [remaining, setRemaining] = useState(Math.ceil(durationMs / 1000));
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setRemaining(Math.ceil(durationMs / 1000));
    const id = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(id);
          onDismiss();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [durationMs, onDismiss]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-modal flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-popover p-8 text-center shadow-lg animate-shake"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('dismiss')}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold tracking-tight">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

        {/* Countdown — subtle */}
        <p className="mt-4 text-sm text-muted-foreground">
          {t('wait')} <span className="tabular-nums text-foreground">{remaining}</span> {t('seconds')}
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="mx-auto mt-5 block w-full max-w-xs rounded-2xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t('button')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
