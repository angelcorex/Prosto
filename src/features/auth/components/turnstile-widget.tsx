'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '@/providers/i18n-provider';
import { TURNSTILE_UNAVAILABLE } from '@/lib/security/turnstile-constants';

/**
 * Cloudflare Turnstile widget for auth forms.
 *
 * Renders the challenge and drops the resulting token into a hidden
 * `cf-turnstile-response` field so it's submitted with the form and verified
 * server-side (see `@/lib/security/turnstile`).
 *
 * Renders nothing when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset, so the forms
 * work unchanged until Turnstile is configured.
 *
 * Graceful degradation: Turnstile is a THIRD-PARTY dependency. If its script
 * can't load (Cloudflare outage, the widget is paused/misconfigured, an ad
 * blocker, a regional block, …) the widget must NOT permanently disable the
 * only way to sign in. On load error / render error / a load timeout it shows a
 * retry affordance and emits the {@link TURNSTILE_UNAVAILABLE} marker so the
 * submit button un-gates. The server only honours that marker when Cloudflare
 * is itself unreachable, so it can't be abused as a blanket bot bypass while
 * Turnstile is up.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Re-exported for callers that import it from the widget. */
export { TURNSTILE_UNAVAILABLE };

/** How long to wait for the widget to appear before degrading to "unavailable". */
const LOAD_TIMEOUT_MS = 9000;

/** True when running on a localhost origin (any build mode). Client-only. */
const IS_LOCALHOST =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(window.location.hostname);

/**
 * True when Turnstile is active — forms use this to gate the submit button.
 * Disabled in local development AND on any localhost origin (even a production
 * build run locally, where NODE_ENV is 'production'), so the captcha never
 * blocks you while working locally. On in real deployments where a site key is
 * set and the host isn't localhost.
 */
export const TURNSTILE_ENABLED =
  Boolean(SITE_KEY) && process.env.NODE_ENV !== 'development' && !IS_LOCALHOST;

// Minimal shape of the global injected by the Turnstile script.
interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  onVerify,
  resetKey,
}: {
  onVerify?: (token: string | null) => void;
  /**
   * Change this to force a fresh challenge. A Turnstile token is single-use, so
   * once a form submission has consumed it, the widget must be reset before the
   * next attempt — otherwise the stale token is re-sent and rejected ("captcha
   * failed") with no way to pass it. Forms pass their action `state` here: its
   * reference changes after every submission, triggering a reset.
   */
  resetKey?: unknown;
}) {
  const t = useT('auth.captcha');
  const boxRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const [token, setToken] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const prevResetKeyRef = useRef(resetKey);
  const unavailableRef = useRef(false);
  unavailableRef.current = unavailable;

  const emit = useCallback((tok: string) => {
    // A real token supersedes a prior "unavailable" fallback (e.g. the script
    // finished loading just after the timeout fired).
    if (tok) setUnavailable(false);
    setToken(tok);
    onVerifyRef.current?.(tok || null);
  }, []);

  const markUnavailable = useCallback(() => {
    if (unavailableRef.current) return;
    setUnavailable(true);
    setToken(TURNSTILE_UNAVAILABLE);
    onVerifyRef.current?.(TURNSTILE_UNAVAILABLE);
  }, []);

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    let cancelled = false;

    function render() {
      if (cancelled || !boxRef.current || !window.turnstile || idRef.current) return;
      try {
        idRef.current = window.turnstile.render(boxRef.current, {
          sitekey: SITE_KEY,
          theme: 'auto',
          callback: (tok: string) => { if (!cancelled) emit(tok); },
          'expired-callback': () => { if (!cancelled) emit(''); },
          // A rendered widget that errors (bad sitekey/domain, challenge failure)
          // must not trap the user — degrade instead of staying blocked forever.
          'error-callback': () => { if (!cancelled) markUnavailable(); },
        });
      } catch {
        markUnavailable();
      }
    }

    // If the widget never becomes usable in time, degrade so the form is not
    // stuck. Only fires when nothing rendered — an interactive challenge that
    // rendered but awaits the user keeps the normal (gated) flow.
    const timer = setTimeout(() => {
      if (!cancelled && (!window.turnstile || !idRef.current)) markUnavailable();
    }, LOAD_TIMEOUT_MS);

    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (window.turnstile) {
      render();
    } else if (existing) {
      existing.addEventListener('load', render, { once: true });
      existing.addEventListener('error', markUnavailable, { once: true });
    } else {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.setAttribute('data-turnstile', '');
      s.addEventListener('load', render, { once: true });
      // Script blocked / Cloudflare unreachable → degrade instead of locking up.
      s.addEventListener('error', markUnavailable, { once: true });
      document.head.appendChild(s);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idRef.current && window.turnstile) {
        try {
          window.turnstile.remove(idRef.current);
        } catch {
          /* widget already gone */
        }
        idRef.current = null;
      }
    };
  }, [attempt, emit, markUnavailable]);

  // Reset the widget for a fresh, unused token whenever `resetKey` changes
  // (i.e. after a submission consumed the previous token). Skips the initial
  // render and any time the widget isn't mounted yet.
  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    if (prevResetKeyRef.current === resetKey) return;
    prevResetKeyRef.current = resetKey;
    // In degraded mode keep the marker so the button stays usable across retries.
    if (unavailableRef.current) {
      setToken(TURNSTILE_UNAVAILABLE);
      onVerifyRef.current?.(TURNSTILE_UNAVAILABLE);
      return;
    }
    if (!idRef.current || !window.turnstile) return;
    setToken('');
    onVerifyRef.current?.(null);
    try {
      window.turnstile.reset(idRef.current);
    } catch {
      /* widget already gone */
    }
  }, [resetKey]);

  function retry() {
    idRef.current = null;
    setUnavailable(false);
    setToken('');
    onVerifyRef.current?.(null);
    setAttempt((a) => a + 1);
  }

  if (!TURNSTILE_ENABLED) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      {!unavailable && <div ref={boxRef} />}
      {unavailable && (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-xs text-muted-foreground">{t('unavailable')}</p>
          <button type="button" onClick={retry} className="text-xs font-medium text-link hover:underline">
            {t('retry')}
          </button>
        </div>
      )}
      <input type="hidden" name="cf-turnstile-response" value={token} />
    </div>
  );
}
