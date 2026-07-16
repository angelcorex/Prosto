import type { MetadataRoute } from 'next';
import { site, literalColors } from '@/config';
import { getT } from '@/lib/i18n';

/**
 * Web App Manifest — makes Prosto installable as a PWA (home-screen app) on
 * iOS, Android and desktop. iOS additionally relies on the apple-* meta tags
 * declared in the root layout's `appleWebApp` metadata.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getT('seo');
  return {
    name: site.name,
    short_name: site.name,
    description: t('description'),
    id: '/',
    start_url: '/feed',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: literalColors.pwaBackground,
    theme_color: literalColors.pwaBackground,
    categories: ['social', 'communication'],
    icons: [
      { src: '/favicon/prosto_logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/favicon/prosto_logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/favicon/prosto_logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
