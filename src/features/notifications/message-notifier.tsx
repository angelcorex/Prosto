'use client';

import { useMessageNotifier } from './use-message-notifier';

/**
 * Headless mount for incoming-message alerts (sound everywhere + native toast
 * on desktop). Renders nothing. Mount once.
 */
export function MessageNotifier() {
  useMessageNotifier();
  return null;
}
