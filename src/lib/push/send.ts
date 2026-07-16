import 'server-only';

import webpush from 'web-push';

import { env } from '@/lib/utils/env';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Server-side Web Push sender.
 *
 * Sends a notification payload to every push endpoint a user has registered.
 * Uses the service-role client (bypasses RLS) to read another user's
 * subscriptions — this only ever runs in trusted server code. Expired / gone
 * endpoints (404/410) are pruned so we don't keep retrying dead devices.
 *
 * No-op when VAPID isn't configured, so the app runs fine without push set up.
 */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!env.push.configured) return false;
  webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open on click (e.g. /messages/123 or /s/pid/chan?m=id). */
  url?: string;
  icon?: string | null;
  /** Coalescing tag so repeat notifications for the same chat replace, not stack. */
  tag?: string;
}

/** Send a push to all of `profileId`'s devices. Best-effort; never throws. */
export async function sendPushToUser(profileId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subs } = await (admin as any)
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('profile_id', profileId);

  if (!subs || subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    icon: payload.icon ?? undefined,
    tag: payload.tag,
  });

  const gone: string[] = [];
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
      }
    }),
  );

  // Prune dead endpoints so we stop pushing to uninstalled/expired devices.
  if (gone.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('push_subscriptions').delete().in('endpoint', gone);
  }
}
