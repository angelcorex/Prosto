/**
 * Map an action error code to a localized message. Falls back to a generic
 * message for unmapped codes. `t` is a useT('developers') instance.
 */
const KNOWN = new Set([
  'unauthenticated', 'rate_limited', 'create_failed', 'usernameTaken', 'not_your_bot',
  'token_failed', 'revoke_failed', 'update_failed', 'delete_failed', 'add_failed',
  'remove_failed', 'command_failed', 'usernameTooShort', 'usernameTooLong',
  'usernameInvalidChars', 'usernameEdge', 'usernameDoubleUnderscore',
]);

export function errorMessage(t: (k: string) => string, code: string): string {
  const key = KNOWN.has(code) ? `error.${code}` : 'error.generic';
  const msg = t(key);
  // useT returns the key itself on a miss — guard so we never show a raw key.
  return msg === key ? t('error.generic') : msg;
}
