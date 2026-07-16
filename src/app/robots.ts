import type { MetadataRoute } from 'next';

import { site } from '@/config';

/**
 * robots.txt — allow crawling of public pages, keep private/app + API routes
 * out of the index, and point crawlers at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/settings', '/messages', '/auth/'],
    },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
