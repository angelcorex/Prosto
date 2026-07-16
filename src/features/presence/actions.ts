'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { PresenceStatus } from './presence';

export async function setStatus(status: PresenceStatus) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('profiles')
    .update({ status })
    .eq('id', user.id);

  revalidatePath('/', 'layout');
  return { success: true };
}

/** Set or clear the current user's custom status text (≤45 chars, empty clears). */
export async function setCustomStatus(status: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('set_custom_status', { p_status: status });

  revalidatePath('/', 'layout');
  return { success: true };
}
