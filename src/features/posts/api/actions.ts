'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { uploadFile, objectKey, BUCKETS } from '@/lib/storage';
import { imageUrlOf, isStorageUrl, mediaKind, normalizeMediaUrl, uploadLimitBytes, MAX_CHAT_IMAGES, type ChatAttachment } from '@/lib/utils/media';
import { getT } from '@/lib/i18n';
import type { CreatePostState } from '../types';

/**
 * Trust boundary for post media: accept only URLs we control — our own object
 * storage (everything uploaded via uploadPostFile) or a Tenor/Giphy GIF from
 * the picker. Anything else (arbitrary external URLs) is rejected so a crafted
 * request can't make a post embed foreign content.
 */
function acceptPostUrl(raw: string): ChatAttachment | null {
  const url = normalizeMediaUrl(String(raw).trim());
  if (!url) return null;
  if (isStorageUrl(url)) return { url, kind: mediaKind(url) ?? 'file' };
  if (imageUrlOf(url) && /(?:^|\.)(?:tenor|giphy)\.com\//i.test(url)) return { url, kind: 'image' };
  return null;
}

/** Parse + validate the composer's `attachments` JSON field into a clean list. */
function parseAttachmentsField(raw: string): ChatAttachment[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: ChatAttachment[] = [];
  for (const item of parsed.slice(0, MAX_CHAT_IMAGES)) {
    const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const urlLike = typeof rec.url === 'string' ? rec.url : typeof item === 'string' ? item : '';
    const att = acceptPostUrl(urlLike);
    if (!att) continue;
    const name = typeof rec.name === 'string' && rec.name ? rec.name.slice(0, 200) : undefined;
    const spoiler = rec.spoiler === true;
    const nsfw = rec.nsfw === true;
    out.push({ ...att, ...(name ? { name } : {}), ...(spoiler ? { spoiler } : {}), ...(nsfw ? { nsfw } : {}) });
  }
  return out;
}

export async function createPost(
  _prev: CreatePostState,
  formData: FormData,
): Promise<CreatePostState> {
  const content = String(formData.get('content') ?? '').trim();
  const t = await getT('posts.errors');

  // Back-compat: a lone `image_url` field (older client) becomes one attachment.
  const rawImage = String(formData.get('image_url') ?? '').trim();
  const attachments = parseAttachmentsField(String(formData.get('attachments') ?? ''));
  if (attachments.length === 0 && rawImage) {
    const att = acceptPostUrl(rawImage);
    if (att) attachments.push(att);
  }

  const isNsfw = attachments.some((a) => a.nsfw) || formData.get('is_nsfw') === 'true';

  if (!content && attachments.length === 0) return { error: t('contentRequired') };
  if (content.length > 500) return { error: t('contentTooLong') };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t('notAuthenticated') };

  // Anti-spam: max 8 posts / minute.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(await checkRateLimit(supabase as any, 'post', 8, 60))) {
    return { error: t('rateLimited') };
  }

  // Keep the legacy single-image column populated (first image) for any reader
  // that still looks at image_url; the full set lives in `attachments`.
  const firstImage = attachments.find((a) => a.kind === 'image')?.url ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('posts')
    .insert({ author_id: user.id, content: content || ' ', image_url: firstImage, attachments, is_nsfw: isNsfw });

  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[createPost]', error.message);
    return { error: t('generic') };
  }

  revalidatePath('/feed');
  revalidatePath('/u/[username]', 'page');
  return { success: true };
}

/** Toggle a like on a post. Returns the resulting liked state. */
export async function toggleLike(postId: string): Promise<{ liked?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: existing } = await sb
    .from('post_likes').select('post_id').eq('post_id', postId).eq('user_id', user.id).maybeSingle();

  if (existing) {
    await sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
    return { liked: false };
  }
  if (!(await checkRateLimit(sb, 'like', 60, 60))) return { error: 'rate_limited' };
  await sb.from('post_likes').insert({ post_id: postId, user_id: user.id });

  // Notify the post author once (no self-notify, no spam on re-like).
  const { data: post } = await sb.from('posts').select('author_id').eq('id', postId).maybeSingle();
  if (post?.author_id) await sb.rpc('notify_once', { p_user: post.author_id, p_type: 'like', p_actor: user.id, p_ref: postId });

  return { liked: true };
}

/** Toggle a repost on a post. Returns the resulting reposted state. */
export async function toggleRepost(postId: string): Promise<{ reposted?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: existing } = await sb
    .from('reposts').select('post_id').eq('post_id', postId).eq('user_id', user.id).maybeSingle();

  if (existing) {
    await sb.from('reposts').delete().eq('post_id', postId).eq('user_id', user.id);
    revalidatePath('/feed');
    revalidatePath('/u/[username]', 'page');
    return { reposted: false };
  }
  if (!(await checkRateLimit(sb, 'repost', 30, 60))) return { error: 'rate_limited' };
  await sb.from('reposts').insert({ post_id: postId, user_id: user.id });

  const { data: post } = await sb.from('posts').select('author_id').eq('id', postId).maybeSingle();
  if (post?.author_id) await sb.rpc('notify_once', { p_user: post.author_id, p_type: 'repost', p_actor: user.id, p_ref: postId });

  revalidatePath('/feed');
  revalidatePath('/u/[username]', 'page');
  return { reposted: true };
}

/** Delete one of the current user's own posts. */
export async function deletePost(postId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('posts').delete().eq('id', postId).eq('author_id', user.id);
  revalidatePath('/feed');
  revalidatePath('/u/[username]', 'page');
  return { success: true };
}

/** Edit the content of one of the current user's own posts. */
export async function editPost(postId: string, content: string): Promise<{ success?: boolean; error?: string }> {
  const t = await getT('posts.errors');
  const body = content.trim();
  if (!body) return { error: t('contentRequired') };
  if (body.length > 500) return { error: t('contentTooLong') };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t('notAuthenticated') };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('edit_post', { p_post: postId, p_content: body });
  if (error) return { error: t('generic') };

  revalidatePath('/feed');
  revalidatePath('/u/[username]', 'page');
  return { success: true };
}

/** Record one view for a post (call once per session per post, client-side). */
export async function recordPostView(postId: string): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('record_post_view', { p_post: postId });
}

/** Toggle an emoji reaction on a post. Returns added=true when the reaction was added. */
export async function togglePostReaction(postId: string, emoji: string): Promise<{ added?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('toggle_post_reaction', { p_post: postId, p_emoji: emoji });
  if (error) return { error: error.message };
  return { added: !!data };
}


/**
 * Extensions we refuse to host on a public post — executables and markup that
 * could carry script if a viewer opens it directly. Everything else (images,
 * video, audio, pdf, office docs, archives, plain text…) is allowed.
 */
const BLOCKED_UPLOAD_EXT = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'ps1', 'sh', 'jar', 'apk',
  'dll', 'sys', 'vbs', 'js', 'mjs', 'html', 'htm', 'xhtml', 'svg', 'jsp', 'php',
]);

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Upload one attachment (image, video or file) for a post. Returns its public
 * storage URL plus the detected kind + original name, which the compose box
 * collects into the `attachments` field. `createPost` re-validates every URL
 * via {@link acceptPostUrl} (only our storage / known GIF hosts), so the client
 * is never trusted to point at arbitrary hosts.
 */
export async function uploadPostFile(
  formData: FormData,
): Promise<{ url: string | null; kind?: ChatAttachment['kind']; name?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { url: null, error: 'unauthenticated' };

  const file = (formData.get('file') ?? formData.get('image')) as File | null;
  if (!file || file.size === 0) return { url: null, error: 'no_file' };
  if (BLOCKED_UPLOAD_EXT.has(fileExt(file.name))) return { url: null, error: 'invalid_type' };

  // Super Prosto subscribers get a higher upload cap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prof } = await (supabase as any).from('profiles').select('is_premium').eq('id', user.id).maybeSingle();
  if (file.size > uploadLimitBytes(prof?.is_premium)) return { url: null, error: 'too_large' };

  // Anti-spam: cap uploads per minute.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(await checkRateLimit(supabase as any, 'post_image', 20, 60))) {
    return { url: null, error: 'rate_limited' };
  }

  try {
    const { url } = await uploadFile(BUCKETS.posts, objectKey(user.id, file), file);
    const kind: ChatAttachment['kind'] =
      file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : (mediaKind(url) ?? 'file');
    return { url, kind, name: file.name };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadPostFile]', e);
    return { url: null, error: 'upload_failed' };
  }
}
