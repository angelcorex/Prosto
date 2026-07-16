'use server';

import { createClient } from '@/lib/supabase/server';
import { uploadFile, extOf, BUCKETS } from '@/lib/storage';

/** Upload a group avatar to object storage and return its public URL. */
export async function uploadGroupAvatar(formData: FormData): Promise<{ url: string | null; error?: string }> {
  const file = formData.get('avatar') as File | null;
  if (!file || file.size === 0) return { url: null, error: 'no_file' };
  if (file.size > 5 * 1024 * 1024) return { url: null, error: 'too_large' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { url: null, error: 'unauthenticated' };

  // Unique key per upload — no cache-busting needed.
  const key = `group/${user.id}-${Date.now()}.${extOf(file, 'png')}`;
  try {
    const { url } = await uploadFile(BUCKETS.avatars, key, file);
    return { url };
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadGroupAvatar]', e);
    return { url: null, error: 'upload_failed' };
  }
}
