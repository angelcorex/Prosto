'use server';

import { randomBytes } from 'node:crypto';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { uploadFile, extOf, BUCKETS } from '@/lib/storage';
import { generateToken } from '@/lib/bots/token';
import { validateUsernameFormat, normalizeUsername } from '@/features/auth/username-rules';

/**
 * Developer portal server actions.
 *
 * A bot is a real profile backed by an auth.users row created via the
 * service-role admin API (like createConfirmedAccount, but flagged is_bot with
 * a synthetic un-loginable credential). All ownership checks live in SQL RPCs;
 * these actions do validate → auth → checkRateLimit → RPC/admin-insert.
 */

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/** A synthetic, un-loginable email for the bot's auth.users row. */
function botEmail(username: string): string {
  return `bot+${username}.${randomBytes(4).toString('hex')}@bots.prosto.ink`;
}

/**
 * Create a bot: auth user → profile (is_bot) → bots row → first token.
 * Returns the ONE-TIME plaintext token; it is never retrievable again.
 */
export async function createBot(input: {
  username: string; displayName?: string; description?: string; avatarUrl?: string;
}): Promise<ActionResult<{ botId: string; token: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const username = normalizeUsername(input.username || '');
  const fmt = validateUsernameFormat(username);
  if (!fmt.ok) return { ok: false, error: fmt.key };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(await checkRateLimit(supabase as any, 'create_bot', 5, 3600))) {
    return { ok: false, error: 'rate_limited' };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // A long random password the developer never sees — the bot authenticates by
  // API token, never by password/OTP.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: botEmail(username),
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
  });
  if (createErr || !created?.user) return { ok: false, error: 'create_failed' };
  const botId = created.user.id;

  const { error: profErr } = await sb.from('profiles').insert({
    id: botId,
    username,
    display_name: input.displayName?.trim() || null,
    avatar_url: input.avatarUrl || null,
    is_bot: true,
    bot_owner_id: user.id,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(botId).catch(() => {});
    if (profErr.code === '23505') return { ok: false, error: 'usernameTaken' };
    return { ok: false, error: 'create_failed' };
  }

  const { error: botErr } = await sb.from('bots').insert({
    id: botId, owner_id: user.id, description: input.description?.trim() || null,
  });
  if (botErr) {
    await admin.auth.admin.deleteUser(botId).catch(() => {});
    return { ok: false, error: 'create_failed' };
  }

  const token = await mintToken(sb, botId, 'Default token');
  if (!token) return { ok: false, error: 'token_failed' };

  return { ok: true, data: { botId, token } };
}

/** Insert a bot_tokens row and return its one-time plaintext token. */
async function mintToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, botId: string, name: string,
): Promise<string | null> {
  const { data: row, error } = await sb
    .from('bot_tokens')
    .insert({ bot_id: botId, token_hash: 'pending', token_prefix: 'pending', name })
    .select('id')
    .single();
  if (error || !row) return null;

  const gen = generateToken(row.id);
  const { error: upErr } = await sb
    .from('bot_tokens')
    .update({ token_hash: gen.tokenHash, token_prefix: gen.prefix })
    .eq('id', row.id);
  if (upErr) {
    await sb.from('bot_tokens').delete().eq('id', row.id);
    return null;
  }
  return gen.token;
}

/** Create an additional token for a bot the caller owns. One-time plaintext. */
export async function createToken(botId: string, name?: string): Promise<ActionResult<{ token: string }>> {
  const guard = await ownGuard(botId);
  if (!guard.ok) return guard;
  const token = await mintToken(guard.sb, botId, (name || 'Token').slice(0, 60));
  if (!token) return { ok: false, error: 'token_failed' };
  return { ok: true, data: { token } };
}

/** Revoke a token by id (owner only). */
export async function revokeToken(botId: string, tokenId: string): Promise<ActionResult> {
  const guard = await ownGuard(botId);
  if (!guard.ok) return guard;
  const { error } = await guard.sb
    .from('bot_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId).eq('bot_id', botId);
  return error ? { ok: false, error: 'revoke_failed' } : { ok: true };
}

/** Update a bot's profile/description (owner only). */
export async function updateBot(botId: string, input: {
  displayName?: string; description?: string; avatarUrl?: string; isActive?: boolean;
}): Promise<ActionResult> {
  const guard = await ownGuard(botId);
  if (!guard.ok) return guard;

  const profilePatch: Record<string, unknown> = {};
  if (input.displayName !== undefined) profilePatch.display_name = input.displayName.trim() || null;
  if (input.avatarUrl !== undefined) profilePatch.avatar_url = input.avatarUrl || null;
  if (Object.keys(profilePatch).length) {
    await guard.sb.from('profiles').update(profilePatch).eq('id', botId);
  }

  const botPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.description !== undefined) botPatch.description = input.description.trim() || null;
  if (input.isActive !== undefined) {
    botPatch.is_active = input.isActive;
    botPatch.disabled_at = input.isActive ? null : new Date().toISOString();
  }
  const { error } = await guard.sb.from('bots').update(botPatch).eq('id', botId);
  return error ? { ok: false, error: 'update_failed' } : { ok: true };
}

/** Delete a bot entirely (owner only) — cascades tokens/commands/interactions. */
export async function deleteBot(botId: string): Promise<ActionResult> {
  const guard = await ownGuard(botId);
  if (!guard.ok) return guard;
  // Deleting the auth user cascades to profiles → bots (FK on delete cascade).
  const { error } = await guard.admin.auth.admin.deleteUser(botId);
  return error ? { ok: false, error: 'delete_failed' } : { ok: true };
}

/**
 * Upload a bot avatar from a file (same flow as a user avatar): store it in the
 * avatars bucket keyed by the bot id, then update the bot's profile row. Owner-
 * guarded. Returns the cache-busted public URL. Static images only (no GIF perk
 * for bots), server-side type + size checks — the client cap isn't trusted.
 */
const BOT_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function uploadBotAvatar(
  botId: string, formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const guard = await ownGuard(botId);
  if (!guard.ok) return guard;

  const file = formData.get('avatar') as File | null;
  if (!file || file.size === 0) return { ok: false, error: 'create_failed' };
  if (!BOT_AVATAR_TYPES.has(file.type)) return { ok: false, error: 'create_failed' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: 'create_failed' };

  const key = `avatar/${botId}.${extOf(file)}`;
  let uploaded;
  try {
    uploaded = await uploadFile(BUCKETS.avatars, key, file);
  } catch {
    return { ok: false, error: 'create_failed' };
  }
  // Cache-bust: the key is stable/overwritten, so vary the URL to dodge caches.
  const url = `${uploaded.url}?t=${Date.now()}`;
  await guard.sb.from('profiles')
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq('id', botId);
  return { ok: true, data: { url } };
}

/** Add / remove a bot to a server (owner-guarded in the RPC too). */
export async function addBotToServer(botId: string, serverId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('add_bot_to_server', { p_bot: botId, p_server: serverId });
  return error ? { ok: false, error: 'add_failed' } : { ok: true };
}
export async function removeBotFromServer(botId: string, serverId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('remove_bot_from_server', { p_bot: botId, p_server: serverId });
  return error ? { ok: false, error: 'remove_failed' } : { ok: true };
}

// Slash commands are defined in the bot's CODE and synced via
// PUT /api/v1/commands — the portal no longer edits them, so there are no
// upsertCommand/deleteCommand server actions here. (The underlying
// upsert_bot_command / delete_bot_command RPCs remain for the API.)

/**
 * Ownership guard: confirms the signed-in user owns the bot and returns a
 * service-role client for the privileged writes (token hashes, cascade delete).
 */
async function ownGuard(botId: string): Promise<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { ok: true; sb: any; admin: ReturnType<typeof createAdminClient>; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: bot } = await sb.from('bots').select('owner_id').eq('id', botId).maybeSingle();
  if (!bot || bot.owner_id !== user.id) return { ok: false, error: 'not_your_bot' };
  return { ok: true, sb, admin, userId: user.id };
}
