'use client';

import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import { twemojiUrl } from '@/lib/utils/twemoji';
import { DISPLAY_NAME_MAX } from '@/lib/utils/display-name';
import { getEmojiById, getEmojiByName, subscribeEmojis, getEmojiVersion } from '@/lib/emoji';
import { CustomEmoji, CUSTOM_EMOJI_SRC, UNICODE_EMOJI_SRC, parseEmojiToken } from './custom-emoji';

/* ─────────────────────────────────────────────────────────────────────────
 * Inline emoji rendering for plain text — nicknames, bios, post bodies.
 *
 * Renders custom-emoji tokens (`<:name:id>` / `<a:name:id>`) and Unicode emoji
 * (via Twemoji), leaving all other text untouched. A leading backslash escapes
 * an emoji so it shows as raw text — e.g. `\<:wave:ID>` prints the token and
 * `\😀` prints the character, matching Discord's copy-the-code behaviour.
 * ──────────────────────────────────────────────────────────────────────── */

// One matcher: escaped emoji (group 1, backslash stripped) → literal text;
// custom-emoji token (group 2); Unicode emoji (group 3).
function buildMatcher(): RegExp {
  return new RegExp(
    '\\\\(' + CUSTOM_EMOJI_SRC + '|:[a-z0-9_]{2,32}:|' + UNICODE_EMOJI_SRC + ')' +
      '|(' + CUSTOM_EMOJI_SRC + ')' +
      '|(' + UNICODE_EMOJI_SRC + ')',
    'giu',
  );
}

/** Tokenise text into React nodes, rendering emoji and honouring `\` escapes. */
export function renderEmojiNodes(
  text: string,
  { interactive = false, keyPrefix = 'e' }: { interactive?: boolean; keyPrefix?: string } = {},
): ReactNode[] {
  if (!text) return [text];
  const out: ReactNode[] = [];
  const re = buildMatcher();
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}${i++}`;

    if (m[1] != null) {
      // Escaped emoji → show the raw text without the leading backslash.
      out.push(<Fragment key={key}>{m[1]}</Fragment>);
    } else if (m[2] != null) {
      const p = parseEmojiToken(m[2]);
      out.push(
        p
          ? <CustomEmoji key={key} name={p.name} payload={p.payload} animated={p.animated} interactive={interactive} />
          : m[2],
      );
    } else if (m[3] != null) {
      out.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img key={key} src={twemojiUrl(m[3])} alt={m[3]} decoding="async" draggable={false} className="inline-block h-[1.3em] w-[1.3em] align-[-0.2em] object-contain" />,
      );
    }

    last = m.index + m[0].length;
    if (re.lastIndex === m.index) re.lastIndex++; // guard zero-width matches
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Clamp text to a maximum *visual* length, cutting at emoji/character
 * boundaries and appending an ellipsis when anything is dropped.
 *
 * Visual units mirror the display-name limit rule: a live custom emoji is one
 * glyph (counts 2) and a Unicode emoji counts by code point. The important part
 * for deleted emojis: a token whose emoji no longer exists renders as its
 * `:name:` fallback, so here it counts as those real characters — a name that
 * fit while the emoji was alive is now correctly seen as over-length and gets
 * truncated instead of spilling a long `:name:` string across the layout.
 */
function clampToVisualLength(text: string, max: number): string {
  if (!text || max <= 0) return text;
  const re = buildMatcher();
  let out = '';
  let visual = 0;
  let last = 0;
  let truncated = false;
  let m: RegExpExecArray | null;

  // Append plain text one code point at a time, stopping at the budget.
  const pushPlain = (s: string): void => {
    for (const ch of s) {
      if (visual >= max) { truncated = true; return; }
      out += ch;
      visual += 1;
    }
  };

  while ((m = re.exec(text))) {
    if (m.index > last) {
      pushPlain(text.slice(last, m.index));
      if (truncated) break;
    }
    let unit: number;
    if (m[1] != null) {
      unit = [...m[1]].length; // escaped emoji → its literal text
    } else if (m[2] != null) {
      const p = parseEmojiToken(m[2]);
      const alive = p ? !!(getEmojiById(p.payload) ?? getEmojiByName(p.name)) : false;
      // Live emoji = 1 glyph (count 2); dead emoji = its `:name:` fallback text.
      unit = alive ? 2 : p ? p.name.length + 2 : [...m[0]].length;
    } else {
      unit = [...(m[3] ?? '')].length; // Unicode emoji
    }
    if (visual + unit > max) { truncated = true; break; }
    out += m[0];
    visual += unit;
    last = m.index + m[0].length;
    if (re.lastIndex === m.index) re.lastIndex++; // guard zero-width matches
  }
  if (!truncated && last < text.length) pushPlain(text.slice(last));
  return truncated ? out + '…' : out;
}

/**
 * Inline text with emoji rendered — for nicknames, display names and any short
 * label. Custom emoji get a right-click "copy" menu; `interactive` additionally
 * enables the click-to-open server popup (used inside chat).
 *
 * Pass `clamp` (or an explicit `maxLength`) to cap the visual length — used for
 * display names so a name whose custom emoji were deleted (and now render as
 * long `:name:` text) is truncated with an ellipsis instead of overflowing.
 */
export function EmojiText({
  content,
  className,
  interactive = false,
  clamp = false,
  maxLength,
}: {
  content: string;
  className?: string;
  interactive?: boolean;
  clamp?: boolean;
  maxLength?: number;
}) {
  // Re-render when the emoji registry changes so a token that resolves later
  // stops counting as dead text (its glyph loads and truncation relaxes).
  useSyncExternalStore(subscribeEmojis, getEmojiVersion, () => 0);
  // Clamping reads the client-only emoji registry, which is empty during SSR
  // but may be warm on the client — reading it on the first render would risk a
  // hydration mismatch. So defer clamping until after mount (SSR and the first
  // client render both show the untruncated content, which is always within the
  // stored limit; deleted-emoji truncation kicks in once mounted). This mirrors
  // how CustomEmoji defers its registry lookup to a post-mount effect.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const limit = maxLength ?? (clamp ? DISPLAY_NAME_MAX : undefined);
  const text = mounted && limit != null ? clampToVisualLength(content, limit) : content;
  return <span className={className}>{renderEmojiNodes(text, { interactive })}</span>;
}
