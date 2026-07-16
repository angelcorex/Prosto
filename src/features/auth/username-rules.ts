/**
 * Username validation rules — single source of truth.
 *
 * Used by:
 *  - client-side live feedback (UsernameField)
 *  - the /api/username-check route (availability check)
 *  - the signUp server action (final validation before insert)
 *
 * Rules mirror the DB constraint on public.profiles.username.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** Allowed: lowercase letters, digits, underscores. */
const ALLOWED_RE = /^[a-z0-9_]+$/;
/** Must start and end with a letter or digit. */
const EDGE_RE = /^[a-z0-9].*[a-z0-9]$/;
/** No consecutive underscores. */
const DOUBLE_UNDERSCORE_RE = /__/;

export type UsernameRuleResult =
  | { ok: true }
  | { ok: false; key: UsernameErrorKey };

export type UsernameErrorKey =
  | 'usernameTooShort'
  | 'usernameTooLong'
  | 'usernameInvalidChars'
  | 'usernameEdge'
  | 'usernameDoubleUnderscore';

/**
 * Validate username format only (no DB call).
 * Returns `{ ok: true }` or `{ ok: false, key }` where `key` is an i18n key
 * under `auth.errors.*`.
 */
export function validateUsernameFormat(raw: string): UsernameRuleResult {
  const u = raw.trim().toLowerCase();

  if (u.length < USERNAME_MIN) return { ok: false, key: 'usernameTooShort' };
  if (u.length > USERNAME_MAX) return { ok: false, key: 'usernameTooLong' };
  if (!ALLOWED_RE.test(u))    return { ok: false, key: 'usernameInvalidChars' };
  if (DOUBLE_UNDERSCORE_RE.test(u)) return { ok: false, key: 'usernameDoubleUnderscore' };
  // Edge check only meaningful when length >= 2, already covered above
  if (u.length >= 2 && !EDGE_RE.test(u)) return { ok: false, key: 'usernameEdge' };

  return { ok: true };
}

/** Normalise raw input to the stored form. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
