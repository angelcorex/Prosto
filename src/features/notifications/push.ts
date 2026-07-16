'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Web Push subscription (client side).
 *
 * Registers this device's push endpoint with the server so it receives
 * background notifications when the app is closed. No-op when push isn't
 * configured (no VAPID public key), unsupported, or permission isn't granted.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** VAPID keys are base64url; the PushManager wants a Uint8Array. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToBase64(key: ArrayBuffer | null): string {
  if (!key) return '';
  const bytes = new Uint8Array(key);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Ensure this device is subscribed to push and the subscription is stored
 * server-side. Safe to call repeatedly (idempotent). Requires an active service
 * worker registration and granted Notification permission.
 */
export async function ensurePushSubscribed(): Promise<void> {
  try {
    if (!VAPID_PUBLIC_KEY) return;                        // push not configured
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Skip inside the desktop shell — it uses native OS notifications.
    if (window.prostoDesktop?.isDesktop) return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast the key bytes to BufferSource — TS's DOM lib types the option as
        // ArrayBuffer, but a Uint8Array view is exactly what the API expects.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }

    const json = sub.toJSON();
    const p256dh = json.keys?.p256dh ?? keyToBase64(sub.getKey('p256dh'));
    const auth = json.keys?.auth ?? keyToBase64(sub.getKey('auth'));
    if (!sub.endpoint || !p256dh || !auth) return;

    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('save_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
    });
  } catch {
    // Push is best-effort; never block the app on a subscription failure.
  }
}

/**
 * Fire-and-forget: ask the server to deliver a background Web Push for a just-
 * sent message to the OTHER participants. Safe to call always — the server
 * no-ops when push isn't configured, and skips the sender / DnD / muted.
 */
export function triggerPushForMessage(kind: 'dm' | 'channel', messageId: string): void {
  try {
    if (!messageId || messageId.startsWith('opt-')) return;
    void fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, messageId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
