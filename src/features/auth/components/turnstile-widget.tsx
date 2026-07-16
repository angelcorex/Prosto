'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile widget for auth forms.
 *
 * Renders the challenge and drops the resulting token into a hidden
 * `cf-turnstile-response` field so it's submitted with the form and verified
 * server-side (see `@/lib/security/turnstile`).
 *
 * Renders nothing when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset, so the forms
 * work unchanged until Turnstile is configured.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

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
  const boxRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const [token, setToken] = useState('');
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const prevResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    let cancelled = false;

    function emit(tok: string) {
      setToken(tok);
      onVerifyRef.current?.(tok || null);
    }
    function render() {
      if (cancelled || !boxRef.current || !window.turnstile || idRef.current) return;
      idRef.current = window.turnstile.render(boxRef.current, {
        sitekey: SITE_KEY,
        theme: 'auto',
        callback: (t: string) => emit(t),
        'expired-callback': () => emit(''),
        'error-callback': () => emit(''),
      });
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (window.turnstile) {
      render();
    } else if (existing) {
      existing.addEventListener('load', render, { once: true });
    } else {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.setAttribute('data-turnstile', '');
      s.addEventListener('load', render, { once: true });
      document.head.appendChild(s);
    }

    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) {
        try {
          window.turnstile.remove(idRef.current);
        } catch {
          /* widget already gone */
        }
        idRef.current = null;
      }
    };
  }, []);

  // Reset the widget for a fresh, unused token whenever `resetKey` changes
  // (i.e. after a submission consumed the previous token). Skips the initial
  // render and any time the widget isn't mounted yet.
  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    if (prevResetKeyRef.current === resetKey) return;
    prevResetKeyRef.current = resetKey;
    if (!idRef.current || !window.turnstile) return;
    setToken('');
    onVerifyRef.current?.(null);
    try {
      window.turnstile.reset(idRef.current);
    } catch {
      /* widget already gone */
    }
  }, [resetKey]);

  if (!TURNSTILE_ENABLED) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={boxRef} />
      <input type="hidden" name="cf-turnstile-response" value={token} />
    </div>
  );
}
