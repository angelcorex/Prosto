'use server';

import { revalidatePath } from 'next/cache';
import { createClient }   from '@/lib/supabase/server';

/**
 * Send a DM through the server (same path SSR uses).
 *
 * The chat window normally calls the `send_dm` RPC directly from the browser
 * for speed. On some clients (notably the desktop shell on certain machines)
 * that direct browser→Supabase request fails with "Failed to fetch" while the
 * Vercel server can still reach Supabase. This action is the fallback: it runs
 * the same RPC server-side, so sending works whenever the page itself loads.
 */
export async function sendDmViaServer(
  conversationId: string,
  body: string,
  reply: string | null,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('send_dm', {
    conv_id: conversationId,
    body,
    reply: reply ?? null,
  });

  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[sendDmViaServer]', error.message);
    return { error: error.message ?? 'failed' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath(`/messages/${conversationId}`);
  return { id: row?.id as string | undefined, created_at: row?.created_at as string | undefined };
}

/** Hide a conversation from the current user's DM list (self-only). */
export async function hideConversation(conversationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('conversation_participants')
    .update({ hidden: true, pinned: false })
    .eq('conversation_id', conversationId)
    .eq('profile_id', user.id);

  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[hideConversation]', error.message);
    return { error: 'failed' };
  }

  revalidatePath('/messages');
  return { success: true };
}

/** Toggle pinned state of a conversation for the current user (self-only). */
export async function togglePinConversation(conversationId: string, pinned: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('conversation_participants')
    .update({ pinned })
    .eq('conversation_id', conversationId)
    .eq('profile_id', user.id);

  revalidatePath('/messages');
  return { success: true };
}

/** Toggle muted state of a conversation for the current user (self-only). */
export async function toggleMuteConversation(conversationId: string, muted: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('conversation_participants')
    .update({ muted })
    .eq('conversation_id', conversationId)
    .eq('profile_id', user.id);

  revalidatePath('/messages');
  return { success: true };
}
