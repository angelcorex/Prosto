import { createClient } from './client';

/**
 * De-duplicated fetch of `get_my_conversations`.
 *
 * Three always-mounted client pieces need this list on mount — the DM sidebar
 * (`RealtimeConversationList`), the icon-rail unread badges (`useUnreadDMs`)
 * and the message notifier (`useMessageNotifier`). Previously each fired its
 * own RPC at the same instant, so every page load made THREE identical
 * round-trips. This shares one in-flight request (and its result for a short
 * window) across all callers.
 *
 * `myId` is required — the RPC is keyed by it, and it's already known to every
 * caller (from the shared getBrowserUser cache), so we never trigger an auth
 * round-trip here.
 *
 * Pass `force: true` from polls / realtime handlers that specifically want
 * fresh data; the mount reads leave it false so they coalesce.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConversationRow = any;

const TTL_MS = 3000;

let inflight: Promise<ConversationRow[]> | null = null;
let cached: { at: number; rows: ConversationRow[] } | null = null;

export function getMyConversations(myId: string, force = false): Promise<ConversationRow[]> {
  if (!force) {
    if (inflight) return inflight;
    if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.rows);
  }

  const sb = createClient();
  const p = (sb as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: ConversationRow[] | null }>;
  })
    .rpc('get_my_conversations', { my_id: myId })
    .then(({ data }) => {
      const rows = Array.isArray(data) ? data : [];
      cached = { at: Date.now(), rows };
      return rows;
    })
    .finally(() => {
      if (inflight === p) inflight = null;
    });

  inflight = p;
  return p;
}
