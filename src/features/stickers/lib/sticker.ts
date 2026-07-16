import { STICKER_SET, stickerUrl } from '../stickers';

/**
 * Stickers travel as a message whose content is `sticker:<id>`. This keeps them
 * distinct from images/text without a schema change, and lets us render them in
 * a non-downloadable way (the raw URL is never exposed as a link).
 */
const PREFIX = 'sticker:';

export function stickerContent(id: string): string {
  return `${PREFIX}${id}`;
}

export function isStickerContent(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.startsWith(PREFIX);
}

/** Resolve a sticker message to its image URL, or null if it isn't a (known) sticker. */
export function stickerOf(content: string | null | undefined): string | null {
  if (!content || !content.startsWith(PREFIX)) return null;
  const id = content.slice(PREFIX.length).trim();
  return STICKER_SET.has(id) ? stickerUrl(id) : null;
}
