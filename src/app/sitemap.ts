import type { MetadataRoute } from 'next';

import { site } from '@/config';

/**
 * Sitemap of the public, indexable routes. Per-user/profile pages are
 * intentionally omitted (unbounded + behind auth); the landing, download and
 * legal pages are what we want search engines to surface.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '',                   priority: 1.0, changeFrequency: 'daily' },
    { path: '/download',          priority: 0.7, changeFrequency: 'monthly' },
    { path: '/sign-in',           priority: 0.5, changeFrequency: 'yearly' },
    { path: '/sign-up',           priority: 0.6, changeFrequency: 'yearly' },
    { path: '/legal/terms',       priority: 0.3, changeFrequency: 'yearly' },
    { path: '/legal/privacy',     priority: 0.3, changeFrequency: 'yearly' },
    { path: '/legal/guidelines',  priority: 0.3, changeFrequency: 'yearly' },
  ];

  return entries.map((e) => ({
    url: `${site.url}${e.path}`,
    lastModified: now,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
