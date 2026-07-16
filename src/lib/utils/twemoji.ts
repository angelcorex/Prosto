/**
 * Twemoji helpers — render Unicode emoji as Twitter's open-source Twemoji
 * images for a consistent cross-platform look.
 *
 * Graphics: Twemoji © Twitter, Inc and other contributors, licensed
 * CC-BY 4.0 (https://github.com/twitter/twemoji).
 *
 * Asset origin is configurable via `NEXT_PUBLIC_TWEMOJI_BASE`:
 *  - unset (default): the maintained jsDelivr mirror (zero-setup, works
 *    everywhere, but the first paint of each glyph waits on the CDN).
 *  - self-hosted: run `node scripts/vendor-twemoji.mjs` to download the 72×72
 *    set into `public/emoji/72x72`, then set
 *    `NEXT_PUBLIC_TWEMOJI_BASE=/emoji/72x72`. Emoji then load same-origin —
 *    effectively instant and offline-capable — with no other code change.
 * A trailing slash is trimmed so both forms work.
 */
const DEFAULT_CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72';
const CDN = (process.env.NEXT_PUBLIC_TWEMOJI_BASE || DEFAULT_CDN).replace(/\/+$/, '');
const U200D = String.fromCharCode(0x200d);
const UFE0F = /\uFE0F/g;

/** Convert an emoji string to Twemoji's hyphen-joined codepoint filename. */
export function toCodePoint(unicodeSurrogates: string, sep = '-'): string {
  const r: string[] = [];
  let c = 0;
  let p = 0;
  let i = 0;
  while (i < unicodeSurrogates.length) {
    c = unicodeSurrogates.charCodeAt(i++);
    if (p) {
      r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16));
      p = 0;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  return r.join(sep);
}

/** Twemoji CDN URL (72×72 PNG) for a given emoji. */
export function twemojiUrl(emoji: string): string {
  // Twemoji strips the FE0F variation selector unless the emoji is a ZWJ
  // sequence (which keeps it).
  const code = toCodePoint(emoji.indexOf(U200D) < 0 ? emoji.replace(UFE0F, '') : emoji);
  return `${CDN}/${code}.png`;
}
