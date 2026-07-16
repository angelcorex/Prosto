'use client';

import { useEffect } from 'react';

import { useT } from '@/providers/i18n-provider';

/**
 * Error boundary for the conversation view. A transient client/render error
 * here (e.g. flaky data on first open) previously bubbled up to the full-page
 * "Application error" white screen. This keeps the app shell and offers a
 * one-tap retry instead. The error is logged so the root cause can be traced.
 */
export default function ConversationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT('messages');

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[conversation] render error:', error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-[15px] font-semibold text-foreground">{t('chatLoadError')}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl bg-link px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        {t('retry')}
      </button>
    </div>
  );
}
