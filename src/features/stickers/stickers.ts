/**
 * Built-in sticker set. Files live in `public/material/stickers/<id>.png`.
 * Only these ids are allowed (validated on render) — no arbitrary paths.
 */
export const STICKERS = [
  'sticker_hello_001',
  'sticker_blep_002',
  'sticker_design_002',
  'sticker_cool_003',
  'sticker_sleep_004',
  'sticker_smile_004',
  'sticker_cry_005',
  'sticker_yippie_006',
  'sticker_photo_007',
] as const;

export type StickerId = (typeof STICKERS)[number];

export const STICKER_SET: ReadonlySet<string> = new Set(STICKERS);

export function stickerUrl(id: string): string {
  return `/material/stickers/${id}.png`;
}
