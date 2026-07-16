/**
 * Display-name length rules.
 *
 * A display name may contain custom-emoji tokens (`<:name:id>` / `<a:name:id>`).
 * Those render as a single emoji image, so the long id must NOT be counted as
 * its raw character length — instead each emoji counts as 2 characters (like a
 * wide glyph). All other text counts by Unicode code point.
 *
 * Pure module (no client/server directives) so it can be shared by the client
 * edit form and the server-side validation.
 */

export const DISPLAY_NAME_MAX = 20;

const EMOJI_TOKEN = /<a?:[a-z0-9_]{2,32}:[^\s>]+>/gi;

/** Visual length of a display name — each custom-emoji token counts as 2. */
export function displayNameLength(name: string): number {
  let tokens = 0;
  const stripped = name.replace(EMOJI_TOKEN, () => { tokens += 1; return ''; });
  // Spread counts by code point so astral chars (incl. unicode emoji) are 1.
  return [...stripped].length + tokens * 2;
}

/** True if the display name is within the allowed visual length. */
export function isDisplayNameWithinLimit(name: string): boolean {
  return displayNameLength(name) <= DISPLAY_NAME_MAX;
}

/**
 * Remove custom-emoji tokens from a name for plain-text contexts that can't
 * render images — input placeholders, the document title, etc. Without this a
 * name like `Флаттершай <a:fluttershy1:123…>` would leak the raw token into the
 * placeholder text.
 */
export function stripEmojiTokens(name: string): string {
  return name.replace(EMOJI_TOKEN, '').replace(/\s{2,}/g, ' ').trim();
}
