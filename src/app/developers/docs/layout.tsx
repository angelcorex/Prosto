import type { ReactNode } from 'react';

import { DocsLayout } from '@/features/developers';

/** Wraps every docs page with the sticky sidebar + content column. */
export default function DocsRouteLayout({ children }: { children: ReactNode }) {
  return <DocsLayout>{children}</DocsLayout>;
}
