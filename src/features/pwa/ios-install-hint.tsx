'use client';

import { useEffect, useState } from 'react';
import { Share, X, Plus } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';

const DISMISS_KEY = 'prosto:ios-install-dismissed';

/**
 * Gentle, dismissible "Add to Home Screen" hint for iOS Safari. iOS has no
 * native install prompt, so we explain the Share → Add to Home Screen flow.
 * Shows only on iOS Safari outside standalone, and only once.
 */
export function IosInstallHint() {
  const t = useT('pwa');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.prostoDesktop?.isDesktop) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const ua = window.navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isIos && isSafari && !standalone) {
      const timer = setTimeout(() => setShow(true), 1800);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  }

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border/50 bg-card/95 p-4 shadow-2xl backdrop-blur-xl animate-fade-in">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon/prosto_logo.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold tracking-tight">{t('installTitle')}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              {t('installStep1')} <Share className="inline h-3.5 w-3.5 -translate-y-px text-link" /> {t('installStep2')} <Plus className="inline h-3.5 w-3.5 -translate-y-px text-link" /> {t('installStep3')}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('dismiss')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
