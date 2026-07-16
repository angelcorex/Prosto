'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit/check';

/** Add a comment to a post, optionally as a reply to another comment (thread). */
export async function addComment(
  postId: string,
  content: string,
  parentId?: string | null,
): Promise<{ success?: boolean; error?: string }> {
  const text = content.trim();
  if (!text) return { error: 'empty' };
  if (text.length > 500) return { error: 'too_long' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  if (!(await checkRateLimit(sb, 'comment', 20, 60))) return { error: 'rate_limited' };

  // Validate the parent belongs to this same post (prevents cross-post threading).
  let parent: string | null = null;
  if (parentId) {
    const { data: p } = await sb.from('post_comments').select('id, author_id, post_id').eq('id', parentId).maybeSingle();
    if (p && p.post_id === postId) parent = p.id;
  }

  const { error } = await sb.from('post_comments').insert({ post_id: postId, author_id: user.id, content: text, parent_id: parent });
  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[addComment]', error.message);
    return { error: 'failed' };
  }

  // Notify once: a reply pings the comment's author; a top-level comment pings
  // the post's author. (No self-notify, no spam on extra comments.)
  if (parent) {
    const { data: pc } = await sb.from('post_comments').select('author_id').eq('id', parent).maybeSingle();
    if (pc?.author_id) await sb.rpc('notify_once', { p_user: pc.author_id, p_type: 'comment', p_actor: user.id, p_ref: postId });
  } else {
    const { data: post } = await sb.from('posts').select('author_id').eq('id', postId).maybeSingle();
    if (post?.author_id) await sb.rpc('notify_once', { p_user: post.author_id, p_type: 'comment', p_actor: user.id, p_ref: postId });
  }

  revalidatePath('/feed');
  revalidatePath('/u/[username]', 'page');
  return { success: true };
}

/** Delete one of the current user's own comments. */
export async function deleteComment(commentId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('post_comments').delete().eq('id', commentId).eq('author_id', user.id);
  return { success: true };
}
