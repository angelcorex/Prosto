'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Set the current user's birth date exactly once (legacy accounts). The DB RPC
 * enforces write-once + the minimum age, so this is a thin, safe wrapper.
 * Returns a short error key on failure so the modal can localize it.
 */
export async function setBirthDate(dateStr: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('set_birth_date', { p_date: dateStr });
  if (error) {
    const m = error.message || '';
    if (m.includes('too young')) return { error: 'tooYoung' };
    if (m.includes('already set')) return { error: 'alreadySet' };
    if (m.includes('invalid')) return { error: 'invalid' };
    return { error: 'generic' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
