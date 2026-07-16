'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { PROVIDERS, buildProviderUrl, displayHandle, type ProviderId } from './providers';

/**
 * Add (or update) a manual connection — a self-declared profile link. The URL
 * is built and validated server-side from the provider's vetted template, so
 * the client can never store an arbitrary or unsafe (e.g. `javascript:`) URL.
 */
export async function addManualConnection(
  provider: ProviderId,
  handle: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  const meta = PROVIDERS[provider];
  if (!meta || meta.kind !== 'manual' || !meta.available) return { error: 'invalid_provider' };

  const url = buildProviderUrl(meta, handle);
  if (!url) return { error: 'invalid_handle' };
  const username = displayHandle(meta, handle);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('upsert_manual_connection', {
    p_provider: provider,
    p_username: username,
    p_url: url,
  });
  if (error) return { error: error.message };

  revalidatePath('/settings/connections');
  return {};
}

/** Remove a connected provider for the current user. */
export async function disconnectProvider(provider: ProviderId): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // Tell the provider to drop the link too (best-effort), before we forget it
  // locally. Only Ataraxis exposes an unlink endpoint.
  if (provider === 'ataraxis') {
    const { ataraxisUnlink } = await import('./ataraxis');
    await ataraxisUnlink(user.id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('disconnect_connection', { p_provider: provider });
  if (error) return { error: error.message };

  revalidatePath('/settings/connections');
  return {};
}

/** Toggle whether a connection appears on the user's public profile. */
export async function setConnectionVisibility(provider: ProviderId, show: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('set_connection_visibility', { p_provider: provider, p_show: show });
  if (error) return { error: error.message };

  revalidatePath('/settings/connections');
  return {};
}
