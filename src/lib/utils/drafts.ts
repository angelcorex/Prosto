/**
 * Per-conversation / per-channel composer drafts.
 *
 * Unsent text is stashed in sessionStorage keyed by scope + id, so switching
 * between chats (or reloading within the session) restores what you were
 * typing. Cleared on send. Client-only; all access is guarded for SSR.
 */

type DraftScope = 'dm' | 'channel';

const key = (scope: DraftScope, id: string) => `prosto:draft:${scope}:${id}`;

export function getDraft(scope: DraftScope, id: string): string {
  if (typeof sessionStorage === 'undefined' || !id) return '';
  try {
    return sessionStorage.getItem(key(scope, id)) ?? '';
  } catch {
    return '';
  }
}

export function setDraft(scope: DraftScope, id: string, text: string): void {
  if (typeof sessionStorage === 'undefined' || !id) return;
  try {
    if (text) sessionStorage.setItem(key(scope, id), text);
    else sessionStorage.removeItem(key(scope, id));
  } catch {
    /* quota / disabled — non-fatal */
  }
}

export function clearDraft(scope: DraftScope, id: string): void {
  if (typeof sessionStorage === 'undefined' || !id) return;
  try {
    sessionStorage.removeItem(key(scope, id));
  } catch {
    /* non-fatal */
  }
}
