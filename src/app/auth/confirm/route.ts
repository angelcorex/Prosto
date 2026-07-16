import { type NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { publicOrigin } from '@/lib/utils/origin';
import { site } from '@/config';

/**
 * Verifies an email token-hash (e.g. a password-recovery link) and establishes
 * the session via cookies, then redirects to the in-app destination. Used by
 * the reset-password email so the flow stays on our own domain.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const origin = publicOrigin(req);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const nextParam = searchParams.get('next') ?? site.routes.feed;
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : site.routes.feed;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL(`${site.routes.signIn}?error=link`, origin));
}
