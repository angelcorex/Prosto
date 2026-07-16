/** OpenGraph/oEmbed-style metadata returned by /api/link-preview. */
export interface LinkPreviewData {
  /** The final (post-redirect) URL the metadata describes. */
  url: string;
  title: string | null;
  description: string | null;
  /** Absolute https image URL (og:image / twitter:image), or null. */
  image: string | null;
  /** Site name (og:site_name) or the bare hostname as a fallback. */
  siteName: string | null;
}
