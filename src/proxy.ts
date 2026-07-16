import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

/**
 * Root proxy (formerly "middleware", renamed in Next.js 16): keeps the Supabase
 * auth session fresh across navigations.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Run on all paths except static assets and image optimization, where
   * session refresh is unnecessary.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
