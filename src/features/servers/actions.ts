'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { uploadFile, extOf, BUCKETS, deleteObjectByUrl } from '@/lib/storage';

/** Best-effort client IP from proxy headers (Caddy/Nginx/Cloudflare). */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  const first = xff ? xff.split(',')[0]?.trim() : null;
  return first || h.get('x-real-ip')?.trim() || null;
}

async function rpc(name: string, args?: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' as const };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(name, args ?? {});
  if (error) {
    if (process.env.NODE_ENV === 'development') console.error(`[${name}]`, error.message);
    return { error: String(error.message ?? 'failed') };
  }
  return { data };
}

export async function createServer(name: string, icon?: string | null) {
  const res = await rpc('create_server', { p_name: name, p_icon: icon ?? null });
  if ('error' in res) return res;
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  revalidatePath('/', 'layout');
  return { id: row?.id as string, publicId: row?.public_id as string };
}

/** Upload a server icon or banner to storage and save it on the server. */
export async function uploadServerImage(serverId: string, kind: 'icon' | 'banner', formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' as const };

  const file = formData.get('file') as File | null;
  if (!file) return { error: 'no file' as const };

  let publicUrl: string;
  try {
    ({ url: publicUrl } = await uploadFile(BUCKETS.servers, `${serverId}/${kind}-${Date.now()}.${extOf(file)}`, file));
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadServerImage]', e);
    return { error: 'upload failed' as const };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('update_server', {
    p_server: serverId,
    p_name: null,
    p_icon: kind === 'icon' ? publicUrl : null,
    p_banner: kind === 'banner' ? publicUrl : null,
  });
  if (error) return { error: String(error.message ?? 'failed') };
  revalidatePath('/', 'layout');
  return { url: publicUrl };
}

/**
 * Upload an icon/banner to storage WITHOUT applying it to the server. Returns
 * the public URL so the editor can preview it; the change is persisted later
 * via `updateServerSettings` when the user hits Save.
 */
export async function uploadServerAsset(serverId: string, kind: 'icon' | 'banner', formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' as const };

  const file = formData.get('file') as File | null;
  if (!file) return { error: 'no file' as const };

  try {
    const { url } = await uploadFile(BUCKETS.servers, `${serverId}/${kind}-${Date.now()}.${extOf(file)}`, file);
    return { url };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadServerAsset]', e);
    return { error: 'upload failed' as const };
  }
}

export async function createChannel(serverId: string, name: string, categoryId?: string | null) {
  const res = await rpc('create_channel', { p_server: serverId, p_name: name, p_category: categoryId ?? null });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { publicId: res.data as string };
}

export async function createCategory(serverId: string, name: string) {
  const res = await rpc('create_category', { p_server: serverId, p_name: name });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { success: true };
}

export async function deleteChannel(channelId: string) {
  const res = await rpc('delete_channel', { p_channel: channelId });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { success: true };
}

export async function deleteCategory(categoryId: string) {
  const res = await rpc('delete_category', { p_category: categoryId });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { success: true };
}

export async function renameChannel(channelId: string, name: string) {
  const res = await rpc('update_channel', { p_channel: channelId, p_name: name });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { success: true };
}

export async function renameCategory(categoryId: string, name: string) {
  const res = await rpc('update_category', { p_category: categoryId, p_name: name });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { success: true };
}

export async function reorderChannels(serverId: string, items: { id: string; category_id: string | null; position: number }[]) {
  const res = await rpc('reorder_channels', { p_server: serverId, p_items: items });
  if ('error' in res) return res;
  return { success: true };
}

export async function reorderCategories(serverId: string, items: { id: string; position: number }[]) {
  const res = await rpc('reorder_categories', { p_server: serverId, p_items: items });
  if ('error' in res) return res;
  return { success: true };
}

export async function updateServer(serverId: string, name: string, banner?: string | null) {
  const res = await rpc('update_server', { p_server: serverId, p_name: name, p_icon: null, p_banner: banner ?? null });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * Patch server fields. `undefined` keeps the value, `''` clears icon/banner,
 * any other string sets it. Mirrors the `update_server` RPC contract.
 */
export async function updateServerSettings(
  serverId: string,
  patch: { name?: string; icon?: string; banner?: string; description?: string; tags?: string[]; isPublic?: boolean; isNsfw?: boolean },
) {
  const res = await rpc('update_server', {
    p_server: serverId,
    p_name: patch.name ?? null,
    p_icon: patch.icon ?? null,
    p_banner: patch.banner ?? null,
    p_description: patch.description ?? null,
    p_tags: patch.tags ?? null,
    p_is_public: patch.isPublic ?? null,
    p_is_nsfw: patch.isNsfw ?? null,
  });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

/** Toggle a channel's age-restricted (18+) flag. */
export async function setChannelNsfw(channelId: string, isNsfw: boolean) {
  const res = await rpc('update_channel', { p_channel: channelId, p_is_nsfw: isNsfw });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { success: true };
}

export async function removeMember(serverId: string, memberId: string) {
  const res = await rpc('remove_member', { p_server: serverId, p_member: memberId });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function setServerVanity(serverId: string, vanity: string) {
  const res = await rpc('set_server_vanity', { p_server: serverId, p_vanity: vanity });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function checkServerVanity(vanity: string) {
  const res = await rpc('check_server_vanity', { p_vanity: vanity });
  // Couldn't verify (e.g. RPC unavailable) — let the user proceed; the server
  // is authoritative on save.
  if ('error' in res) return { available: false, unchecked: true as const };
  return { available: res.data === true };
}

export async function deleteServer(serverId: string) {
  // Collect the server's custom-emoji image URLs before the row cascade so the
  // files can be purged from object storage too (the DB delete won't touch
  // them). Must run while the caller is still a member (RPC is member-gated).
  const emojis = await rpc('list_server_emojis', { p_server: serverId });
  const urls: string[] = !('error' in emojis) && Array.isArray(emojis.data)
    ? (emojis.data as { url?: string }[]).map((e) => e.url).filter((u): u is string => !!u)
    : [];

  const res = await rpc('delete_server', { p_server: serverId });
  if ('error' in res) return res;
  await Promise.all(urls.map((u) => deleteObjectByUrl(u)));
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function leaveServer(serverId: string) {
  const res = await rpc('leave_server', { p_server: serverId });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function createServerInvite(serverId: string, expiresSeconds?: number | null, maxUses?: number | null) {
  const res = await rpc('create_server_invite', {
    p_server: serverId,
    p_expires_seconds: expiresSeconds ?? null,
    p_max_uses: maxUses ?? null,
  });
  if ('error' in res) return res;
  return { token: res.data as string };
}

export interface ServerInvite {
  token: string; inviter_id: string; inviter_username: string; inviter_display_name: string | null;
  inviter_avatar_url: string | null; uses: number; max_uses: number | null; expires_at: string | null; created_at: string;
}

/** List a server's invites (requires MANAGE_INVITES / owner / admin). */
export async function listServerInvites(serverId: string): Promise<{ invites: ServerInvite[] } | { error: string }> {
  const res = await rpc('list_server_invites', { p_server: serverId });
  if ('error' in res) return { error: String(res.error ?? 'failed') };
  return { invites: (Array.isArray(res.data) ? res.data : []) as ServerInvite[] };
}

export async function deleteServerInvite(serverId: string, token: string) {
  const res = await rpc('delete_server_invite', { p_server: serverId, p_token: token });
  if ('error' in res) return res;
  return { success: true };
}

/** Pause invites: seconds>0 → for that long, seconds<=0 → until re-enabled, null → resume. */
export async function setInvitesPaused(serverId: string, seconds: number | null): Promise<{ error: string } | { until: string | null }> {
  const res = await rpc('set_invites_paused', { p_server: serverId, p_seconds: seconds });
  if ('error' in res) return { error: String(res.error ?? 'failed') };
  return { until: (res.data as string | null) ?? null };
}

export async function getInvitesPaused(serverId: string): Promise<{ until: string | null }> {
  const res = await rpc('get_invites_paused', { p_server: serverId });
  if ('error' in res) return { until: null };
  return { until: (res.data as string | null) ?? null };
}

export async function acceptServerInvite(token: string) {
  const ip = await clientIp();
  if (ip) await rpc('note_user_ip', { p_ip: ip });
  const res = await rpc('accept_server_invite', { p_token: token, p_ip: ip });
  if ('error' in res) {
    const e = String(res.error ?? '');
    return { error: e.includes('age_restricted') ? 'age_restricted' : e.includes('banned') ? 'banned' : e };
  }
  revalidatePath('/', 'layout');
  return { publicId: res.data as string };
}

/** Join a public (discoverable) server directly, without an invite token. */
export async function joinPublicServer(publicId: string) {
  const ip = await clientIp();
  if (ip) await rpc('note_user_ip', { p_ip: ip });
  const res = await rpc('join_public_server', { p_public_id: publicId, p_ip: ip });
  if ('error' in res) {
    const e = String(res.error ?? '');
    return { error: e.includes('age_restricted') ? 'age_restricted' : e.includes('banned') ? 'banned' : e };
  }
  revalidatePath('/', 'layout');
  return { publicId: res.data as string };
}

/** Record the caller's current IP (best-effort, for IP bans). Fire-and-forget. */
export async function noteClientIp() {
  const ip = await clientIp();
  if (ip) await rpc('note_user_ip', { p_ip: ip });
  return { ok: true };
}

/* ── Moderation ── */

/** Transfer server ownership to another member (current owner only). */
export async function transferServerOwnership(serverId: string, targetId: string) {
  const res = await rpc('transfer_server_ownership', { p_server: serverId, p_target: targetId });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

/** Ban a member (account + best-effort IP) with an optional reason. */
export async function banMember(serverId: string, targetId: string, reason?: string) {
  const res = await rpc('ban_member', { p_server: serverId, p_target: targetId, p_reason: reason ?? null, p_ip: null });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function unbanMember(serverId: string, targetId: string) {
  const res = await rpc('unban_member', { p_server: serverId, p_target: targetId });
  if ('error' in res) return res;
  return { success: true };
}

export interface ServerBan {
  user_id: string; public_id: string; username: string; display_name: string | null;
  avatar_url: string | null; reason: string | null; banned_ip: string | null; created_at: string;
}

export async function listServerBans(serverId: string, query?: string): Promise<{ bans: ServerBan[] } | { error: string }> {
  const res = await rpc('list_server_bans', { p_server: serverId, p_query: query ?? null });
  if ('error' in res) return { error: String(res.error ?? 'failed') };
  return { bans: (Array.isArray(res.data) ? res.data : []) as ServerBan[] };
}

/** Timeout (mute) a member for `seconds` with an optional reason. seconds<=0 clears it. */
export async function timeoutMember(serverId: string, targetId: string, seconds: number, reason?: string) {
  const res = await rpc('timeout_member', { p_server: serverId, p_target: targetId, p_seconds: seconds, p_reason: reason ?? null });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function removeTimeout(serverId: string, targetId: string) {
  const res = await rpc('remove_timeout', { p_server: serverId, p_target: targetId });
  if ('error' in res) return res;
  revalidatePath('/', 'layout');
  return { success: true };
}

/* ── Server organisation: order, pin, folders ── */
export async function toggleServerPin(serverId: string, pinned: boolean) {
  const res = await rpc('toggle_server_pin', { p_server: serverId, p_pinned: pinned });
  if ('error' in res) return res;
  return { success: true };
}

export async function reorderServers(items: { server_id: string; folder_id: string | null; position: number }[]) {
  const res = await rpc('reorder_my_servers', { p_items: items });
  if ('error' in res) return res;
  return { success: true };
}

export async function createServerFolder(name?: string, color?: string) {
  const res = await rpc('create_server_folder', { p_name: name ?? null, p_color: color ?? null });
  if ('error' in res) return res;
  return { id: res.data as string };
}

export async function updateServerFolder(folderId: string, patch: { name?: string; color?: string; position?: number }) {
  const res = await rpc('update_server_folder', {
    p_folder: folderId,
    p_name: patch.name ?? null,
    p_color: patch.color ?? null,
    p_position: patch.position ?? null,
  });
  if ('error' in res) return res;
  return { success: true };
}

export async function deleteServerFolder(folderId: string) {
  const res = await rpc('delete_server_folder', { p_folder: folderId });
  if ('error' in res) return res;
  return { success: true };
}

/* ── Roles ── */
export async function createRole(serverId: string, name: string) {
  const res = await rpc('create_role', { p_server: serverId, p_name: name });
  if ('error' in res) return res;
  return { id: res.data as string };
}

export async function updateRole(
  roleId: string,
  patch: {
    name?: string; color?: string | null; color2?: string | null; glow?: string | null;
    icon?: string | null; permissions?: number; hoist?: boolean;
    mentionMode?: 'everyone' | 'none' | 'selected'; mentionAllow?: string[]; extra?: string[];
  },
) {
  const res = await rpc('update_role', {
    p_role: roleId,
    p_name: patch.name ?? null,
    p_color: patch.color === undefined ? null : (patch.color ?? ''),
    p_color2: patch.color2 === undefined ? null : (patch.color2 ?? ''),
    p_glow: patch.glow === undefined ? null : (patch.glow ?? ''),
    p_icon: patch.icon === undefined ? null : (patch.icon ?? ''),
    p_permissions: patch.permissions ?? null,
    p_hoist: patch.hoist ?? null,
    p_mention_mode: patch.mentionMode ?? null,
    p_mention_allow: patch.mentionAllow ?? null,
    p_extra: patch.extra ?? null,
  });
  if ('error' in res) return res;
  return { success: true };
}

export async function deleteRole(roleId: string) {
  const res = await rpc('delete_role', { p_role: roleId });
  if ('error' in res) return res;
  return { success: true };
}

export async function setMemberRoles(serverId: string, memberId: string, roleIds: string[]) {
  const res = await rpc('set_member_roles', { p_server: serverId, p_member: memberId, p_roles: roleIds });
  if ('error' in res) return res;
  return { success: true };
}

/** Persist a new role order (drag-to-reorder). Higher position = higher in the list. */
export async function reorderRoles(serverId: string, items: { id: string; position: number }[]) {
  const res = await rpc('reorder_roles', { p_server: serverId, p_items: items });
  if ('error' in res) return res;
  return { success: true };
}

/** Upload a custom role icon to storage; returns its public URL. */
export async function uploadRoleIcon(serverId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' as const };

  const file = formData.get('file') as File | null;
  if (!file) return { error: 'no file' as const };

  try {
    const { url } = await uploadFile(BUCKETS.servers, `${serverId}/roles/${Date.now()}.${extOf(file, 'png')}`, file);
    return { url };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadRoleIcon]', e);
    return { error: 'upload failed' as const };
  }
}

/** Upload a channel theme background (up to 15 MB); returns its public URL. */
export async function uploadChannelTheme(serverId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' as const };

  const file = formData.get('file') as File | null;
  if (!file) return { error: 'no file' as const };
  if (file.type === 'image/gif') return { error: 'gif not allowed' as const };
  if (file.size > 15 * 1024 * 1024) return { error: 'too large' as const };

  try {
    const { url } = await uploadFile(BUCKETS.servers, `${serverId}/themes/${Date.now()}.${extOf(file)}`, file);
    return { url };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadChannelTheme]', e);
    return { error: 'upload failed' as const };
  }
}

/** Apply a theme to one channel, or to the whole server (all channels). */
export async function setChannelTheme(
  channelId: string,
  theme: { image: string | null; dim: number; x: number; y: number; all: boolean },
) {
  const res = await rpc('set_channel_theme', {
    p_channel: channelId,
    p_image: theme.image ?? '',
    p_dim: theme.dim,
    p_x: theme.x,
    p_y: theme.y,
    p_all: theme.all,
  });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { success: true };
}

/** Upload a Server Home asset (banner or whiteboard image); returns its URL. */
export async function uploadServerHomeAsset(serverId: string, kind: 'banner' | 'whiteboard', formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' as const };

  const file = formData.get('file') as File | null;
  if (!file) return { error: 'no file' as const };
  if (file.size > 15 * 1024 * 1024) return { error: 'too large' as const };

  try {
    const { url } = await uploadFile(BUCKETS.servers, `${serverId}/home/${kind}-${Date.now()}.${extOf(file, 'png')}`, file);
    return { url };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadServerHomeAsset]', e);
    return { error: 'upload failed' as const };
  }
}

/** Save the Server Home banner / whiteboard (shared for everyone). */
export async function updateServerHome(serverId: string, patch: { banner?: string | null; whiteboard?: string | null }) {
  const res = await rpc('update_server_home', {
    p_server: serverId,
    p_banner: patch.banner === undefined ? null : (patch.banner ?? ''),
    p_whiteboard: patch.whiteboard === undefined ? null : (patch.whiteboard ?? ''),
  });
  if ('error' in res) return res;
  revalidatePath('/s', 'layout');
  return { success: true };
}

/** Upload a custom server emoji (≤512 KB). GIFs count as animated emojis. */
export async function uploadServerEmoji(serverId: string, name: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' as const };

  const file = formData.get('file') as File | null;
  if (!file) return { error: 'no file' as const };
  if (file.size > 512 * 1024) return { error: 'too large' as const };

  const animated = file.type === 'image/gif';
  const key = `${serverId}/emoji/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(file, animated ? 'gif' : 'png')}`;
  let publicUrl: string;
  try {
    ({ url: publicUrl } = await uploadFile(BUCKETS.servers, key, file));
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadServerEmoji]', e);
    return { error: 'upload failed' as const };
  }

  const res = await rpc('add_server_emoji', { p_server: serverId, p_name: name, p_url: publicUrl, p_animated: animated });
  if ('error' in res) return res;
  return { id: res.data as string, url: publicUrl, animated };
}

/** Delete a custom server emoji by its snowflake public_id (MANAGE_SERVER). */
export async function deleteServerEmoji(publicId: string) {
  // Resolve the emoji's image URL first so the stored file is removed too —
  // otherwise a deleted emoji leaks its image in object storage forever.
  const found = await rpc('get_emoji_by_public_id', { p_id: publicId });
  const url: string | undefined = !('error' in found)
    ? (Array.isArray(found.data) ? found.data[0]?.url : (found.data as { url?: string } | null)?.url)
    : undefined;

  const res = await rpc('delete_server_emoji', { p_id: publicId });
  if ('error' in res) return res;
  if (url) await deleteObjectByUrl(url);
  return { success: true };
}

/** Rename a custom server emoji by its snowflake public_id (MANAGE_SERVER). */
export async function renameServerEmoji(publicId: string, name: string) {
  const res = await rpc('rename_server_emoji', { p_id: publicId, p_name: name });
  if ('error' in res) return res;
  return { success: true };
}

/* ── Channel / category permission overrides (Discord-style) ── */

/**
 * Set a role's allow/deny mask on a channel. Auto-unsyncs the channel from
 * its category (the server RPC also seeds the channel's overrides from the
 * category on first edit so the editor doesn't start blank).
 */
export async function setChannelRoleOverride(channelId: string, roleId: string, allow: number, deny: number) {
  const res = await rpc('set_channel_role_override', {
    p_channel: channelId, p_role: roleId, p_allow: allow, p_deny: deny,
  });
  if ('error' in res) return res;
  return { success: true };
}

export async function removeChannelRoleOverride(channelId: string, roleId: string) {
  const res = await rpc('remove_channel_role_override', { p_channel: channelId, p_role: roleId });
  if ('error' in res) return res;
  return { success: true };
}

export async function setCategoryRoleOverride(categoryId: string, roleId: string, allow: number, deny: number) {
  const res = await rpc('set_category_role_override', {
    p_category: categoryId, p_role: roleId, p_allow: allow, p_deny: deny,
  });
  if ('error' in res) return res;
  return { success: true };
}

export async function removeCategoryRoleOverride(categoryId: string, roleId: string) {
  const res = await rpc('remove_category_role_override', { p_category: categoryId, p_role: roleId });
  if ('error' in res) return res;
  return { success: true };
}

/** Re-sync a channel to its category: drops all channel-specific overrides. */
export async function syncChannelToCategory(channelId: string) {
  const res = await rpc('sync_channel_to_category', { p_channel: channelId });
  if ('error' in res) return res;
  return { success: true };
}

/** Mark every channel in a server read + clear its bell mentions ("read all"). */
export async function markServerRead(serverId: string) {
  const res = await rpc('mark_server_read', { p_server: serverId });
  if ('error' in res) return res;
  return { success: true };
}

export interface ServerNotifySettings {
  level: 'all' | 'mentions' | 'nothing';
  suppressEveryone: boolean;
  suppressRoles: boolean;
  mutedUntil: string | null;
}

/** Save (upsert) my notification settings for a server. Only the passed fields
 *  change; pass `clearMute: true` to un-mute. `mutedUntil` ISO string mutes
 *  until then (use a far-future date for "until I turn it back on"). */
export async function setServerNotifySettings(
  serverId: string,
  opts: {
    level?: 'all' | 'mentions' | 'nothing';
    suppressEveryone?: boolean;
    suppressRoles?: boolean;
    mutedUntil?: string | null;
    clearMute?: boolean;
  },
) {
  const res = await rpc('set_server_notify_settings', {
    p_server: serverId,
    p_level: opts.level ?? null,
    p_suppress_everyone: opts.suppressEveryone ?? null,
    p_suppress_roles: opts.suppressRoles ?? null,
    p_muted_until: opts.mutedUntil ?? null,
    p_clear_mute: opts.clearMute ?? false,
  });
  if ('error' in res) return res;
  return { success: true };
}
