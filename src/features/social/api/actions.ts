'use server';

import { revalidatePath } from 'next/cache';
import { redirect }       from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit/check';

/* ── helpers ── */
async function getMe() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles').select('id').eq('id', user.id).maybeSingle();
  return { supabase, user, profile };
}

/** True when a block exists between the caller and another user in either direction. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isBlockedBetween(supabase: any, otherId: string) {
  const { data } = await supabase.rpc('block_exists_between', { other: otherId });
  return data === true;
}

/* ── Follow / Unfollow ─────────────────────────────────────────────── */
export async function followUser(formData: FormData) {
  const targetId = String(formData.get('target_id'));
  const username = String(formData.get('username'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };
  if (await isBlockedBetween(supabase, targetId)) return { error: 'blocked' };

  // Anti-spam: cap follow churn (30 / minute).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(await checkRateLimit(supabase as any, 'follow', 30, 60))) return { error: 'rate_limited' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('follows').insert({ follower_id: profile.id, following_id: targetId });

  // Notify once (deduped, never self).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('notify_once', { p_user: targetId, p_type: 'follow', p_actor: profile.id, p_ref: null });

  revalidatePath(`/u/${username}`);
  return { success: true };
}

export async function unfollowUser(formData: FormData) {
  const targetId = String(formData.get('target_id'));
  const username = String(formData.get('username'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('follows')
    .delete().eq('follower_id', profile.id).eq('following_id', targetId);

  revalidatePath(`/u/${username}`);
  return { success: true };
}

/* ── Friend request ────────────────────────────────────────────────── */
export async function sendFriendRequest(formData: FormData) {
  const targetId = String(formData.get('target_id'));
  const username = String(formData.get('username'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };
  if (await isBlockedBetween(supabase, targetId)) return { error: 'blocked' };

  // Anti-spam: cap friend requests (20 / minute).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(await checkRateLimit(supabase as any, 'friend_request', 20, 60))) return { error: 'rate_limited' };

  // Idempotent + global: the RPC refuses duplicates, auto-accepts a mutual
  // request, and notifies only once (no spam). The RPC raises 'not_allowed'
  // when the target's privacy_friend_req forbids it, or 'blocked' — surface
  // that so the UI can show "this user doesn't accept friend requests" instead
  // of silently doing nothing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('send_friend_request', { target: targetId });
  if (error) {
    const msg = String(error.message ?? '');
    if (msg.includes('not_allowed')) return { error: 'not_allowed' };
    if (msg.includes('blocked')) return { error: 'blocked' };
    if (process.env.NODE_ENV === 'development') console.error('[sendFriendRequest]', msg);
    return { error: 'failed' };
  }

  revalidatePath(`/u/${username}`);
  return { success: true };
}

export async function cancelFriendRequest(formData: FormData) {
  const targetId = String(formData.get('target_id'));
  const username = String(formData.get('username'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('friend_requests')
    .delete().eq('from_id', profile.id).eq('to_id', targetId);

  revalidatePath(`/u/${username}`);
  return { success: true };
}

/* ── Open / create DM conversation ────────────────────────────────── */
export async function openConversation(formData: FormData) {
  const targetId = String(formData.get('target_id'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // Resolve the target's short public id as TEXT — the snowflake exceeds
  // JS Number.MAX_SAFE_INTEGER, so it must never be parsed as a number.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: target } = await (supabase as any)
    .from('profiles')
    .select('pid:public_id::text')
    .eq('id', targetId)
    .maybeSingle();

  if (!target?.pid) return { error: 'failed' };

  redirect(`/messages/${target.pid}`);
}

/* ── Accept / decline / remove friend ──────────────────────────────── */
export async function acceptFriendRequest(formData: FormData) {
  const fromId = String(formData.get('from_id')); // the requester
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // Idempotent: only a real pending→accepted transition notifies, and
  // notify_once prevents duplicate "accepted" notifications.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('accept_friend_request', { from_user: fromId });

  revalidatePath('/friends');
  revalidatePath('/notifications');
  return { success: true };
}

export async function declineFriendRequest(formData: FormData) {
  const fromId = String(formData.get('from_id'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('friend_requests')
    .delete()
    .eq('from_id', fromId)
    .eq('to_id', profile.id);

  revalidatePath('/friends');
  revalidatePath('/notifications');
  return { success: true };
}

export async function removeFriend(formData: FormData) {
  const otherId = String(formData.get('other_id'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('friend_requests')
    .delete()
    .or(`and(from_id.eq.${profile.id},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${profile.id})`);

  revalidatePath('/friends');
  return { success: true };
}

/* ── Friend invite links ───────────────────────────────────────────── */
export async function createFriendInvite() {
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('create_friend_invite');
  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[createFriendInvite]', error.message);
    return { error: 'failed' };
  }
  return { token: data as string };
}

export async function acceptFriendInvite(token: string) {
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('accept_friend_invite', { p_token: token });
  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[acceptFriendInvite]', error.message);
    return { error: String(error.message ?? 'failed') };
  }

  revalidatePath('/messages');
  revalidatePath('/friends');
  return { publicId: data as string };
}

/* ── Block / Unblock ───────────────────────────────────────────────── */
export async function blockUser(formData: FormData) {
  const targetId = String(formData.get('target_id'));
  const username = String(formData.get('username'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('blocks').upsert(
    { blocker_id: profile.id, blocked_id: targetId },
    { onConflict: 'blocker_id,blocked_id' },
  );

  // Blocking implies no follow / friendship remains.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('follows')
    .delete().eq('follower_id', profile.id).eq('following_id', targetId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('friend_requests')
    .delete().or(`and(from_id.eq.${profile.id},to_id.eq.${targetId}),and(from_id.eq.${targetId},to_id.eq.${profile.id})`);

  revalidatePath(`/u/${username}`);
  return { success: true };
}

export async function unblockUser(formData: FormData) {
  const targetId = String(formData.get('target_id'));
  const username = String(formData.get('username'));
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('blocks')
    .delete().eq('blocker_id', profile.id).eq('blocked_id', targetId);

  revalidatePath(`/u/${username}`);
  return { success: true };
}

/* ── Notifications ─────────────────────────────────────────────────── */
export async function markNotificationsRead() {
  const { supabase, profile } = await getMe();
  if (!profile) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('notifications')
    .update({ read: true })
    .eq('user_id', profile.id)
    .eq('read', false);

  revalidatePath('/notifications');
  return { success: true };
}
