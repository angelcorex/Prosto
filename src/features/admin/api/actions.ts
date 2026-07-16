'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { logEvent } from '@/lib/log';

/**
 * Admin server actions — thin wrappers over the admin_* RPCs.
 *
 * Authorization is enforced in Postgres: every admin_* RPC re-checks
 * is_admin(auth.uid()) and raises 'forbidden' otherwise. These actions add the
 * usual validate → auth → rate-limit shell and surface a clean result to the
 * client, plus an audit line via the logger for mutating calls.
 */

async function getMe() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Grant/revoke role flags on a user. Only non-null flags are applied. */
export async function setUserFlags(input: {
  targetId: string;
  isModerator?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
  isAdmin?: boolean;
}) {
  const { supabase, user } = await getMe();
  if (!user) return { error: 'unauthenticated' };

  // Anti-abuse ceiling; the real gate is is_admin() inside the RPC.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(await checkRateLimit(supabase as any, 'admin_set_flags', 60, 60))) {
    return { error: 'rate_limited' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('admin_set_flags', {
    target: input.targetId,
    p_moderator: input.isModerator ?? null,
    p_verified: input.isVerified ?? null,
    p_premium: input.isPremium ?? null,
    p_admin: input.isAdmin ?? null,
  });

  if (error) {
    if (String(error.message ?? '').includes('forbidden')) return { error: 'forbidden' };
    if (process.env.NODE_ENV === 'development') console.error('[setUserFlags]', error.message);
    return { error: 'failed' };
  }

  void logEvent({
    kind: 'admin-action',
    message: 'set_flags',
    userId: user.id,
    path: '/admin/users',
    meta: { target: input.targetId, ...input },
  });

  revalidatePath('/admin/users');
  return { success: true };
}

export type MetricKey = 'online' | 'dau' | 'wau' | 'mau' | 'total_users' | 'gateway_ms' | 'db_ms';

/**
 * Time-series for a dashboard metric, for the drill-down chart.
 *  - online/dau/wau/mau → snapshot history (accrues while the app is active).
 *  - total_users        → real cumulative growth from profiles.created_at.
 * Returns points as { t: ISO string, v: number }, oldest first.
 */
export async function getMetricSeries(metric: MetricKey, hours: number) {
  const { supabase, user } = await getMe();
  if (!user) return { error: 'unauthenticated' as const };

  if (metric === 'total_users') {
    const days = Math.max(1, Math.min(365, Math.ceil(hours / 24)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('admin_growth_series', { days });
    if (error) return { error: 'failed' as const };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points = (data ?? []).map((r: any) => ({ t: r.day, v: r.total as number }));
    return { points };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('admin_metric_series', {
    p_metric: metric,
    p_hours: hours,
  });
  if (error) return { error: 'failed' as const };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const points = (data ?? []).map((r: any) => ({ t: r.t, v: r.v as number }));
  return { points };
}
