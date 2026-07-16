'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { uploadFile, extOf, BUCKETS } from '@/lib/storage';
import { getT } from '@/lib/i18n';
import { validateUsernameFormat, normalizeUsername } from '@/features/auth/username-rules';
import { displayNameLength, DISPLAY_NAME_MAX, stripEmojiTokens } from '@/lib/utils/display-name';

export type ProfileFormState = {
  success?: boolean;
  message?: string;
  fieldErrors?: {
    username?: string;
    displayName?: string;
    bio?: string;
    pronouns?: string;
  };
};

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { message: 'Unauthorized' };

  const rawUsername    = String(formData.get('username')    ?? '').trim();
  // Strip custom-emoji tokens (<:name:id>) from the display name — they are no
  // longer supported in names (they break when the emoji is deleted).
  const displayName    = stripEmojiTokens(String(formData.get('displayName') ?? ''));
  const bio            = String(formData.get('bio')         ?? '').trim();
  const pronouns       = String(formData.get('pronouns')    ?? '').trim();
  const avatarUrl      = String(formData.get('avatar_url')  ?? '').trim();
  const bannerUrl      = String(formData.get('banner_url')  ?? '').trim();
  const avatarPos      = String(formData.get('avatar_pos')  ?? '').trim().slice(0, 40);
  const bannerPos      = String(formData.get('banner_pos')  ?? '').trim().slice(0, 40);

  const te = await getT('settings');
  const fieldErrors: ProfileFormState['fieldErrors'] = {};

  // Validate username
  const username = normalizeUsername(rawUsername);
  const fmtResult = validateUsernameFormat(username);
  if (!fmtResult.ok) {
    const tauth = await getT('auth.errors');
    fieldErrors.username = tauth(fmtResult.key);
  }

  // Validate display name (custom-emoji tokens count as 2 chars, not their id).
  if (displayNameLength(displayName) > DISPLAY_NAME_MAX) fieldErrors.displayName = te('errorDisplayNameTooLong');

  // Validate bio
  if (bio.length > 200) fieldErrors.bio = te('errorBioTooLong');

  // Validate pronouns
  if (pronouns.length > 40) fieldErrors.pronouns = te('pronounsHint');

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // Check username uniqueness across canonical usernames AND additional
  // usernames (aliases), excluding the caller's own rows. The DB triggers
  // enforce this too; this yields a clean field error instead of a raw failure.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: taken } = await (supabase as any)
    .rpc('username_taken', { handle: username, owner: user.id });

  if (taken === true) {
    const tauth = await getT('auth.errors');
    return { fieldErrors: { username: tauth('usernameTaken') } };
  }

  // Upsert profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('profiles')
    .upsert({
      id: user.id,
      username,
      display_name: displayName || null,
      bio: bio || null,
      pronouns: pronouns || null,
      avatar_url: avatarUrl || null,
      banner_url: bannerUrl || null,
      avatar_pos: avatarPos || null,
      banner_pos: bannerPos || null,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[updateProfile]', error.message);
    }
    return { message: te('errorGeneric') };
  }

  revalidatePath('/', 'layout');
  revalidatePath(`/u/${username}`);

  return { success: true, message: te('saved') };
}

export async function uploadAvatar(formData: FormData): Promise<{ url: string | null; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { url: null, error: 'Unauthorized' };

  const file = formData.get('avatar') as File | null;
  if (!file || file.size === 0) return { url: null, error: 'No file' };

  // Animated GIF avatars are a Super Prosto perk — verify server-side (the
  // client bypasses its cropper only for premium, but never trust the client).
  const isGif = file.type === 'image/gif';
  if (isGif) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any).from('profiles').select('is_premium').eq('id', user.id).maybeSingle();
    if (!prof?.is_premium) return { url: null, error: 'premium_required' };
  }
  const maxBytes = isGif ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxBytes) return { url: null, error: 'File too large' };

  const avatarKey = `avatar/${user.id}.${extOf(file)}`;
  let uploaded;
  try {
    uploaded = await uploadFile(BUCKETS.avatars, avatarKey, file);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadAvatar]', e);
    return { url: null, error: 'Upload failed' };
  }

  // Cache-bust: the key is stable and overwritten, so vary the URL to dodge
  // stale browser/CDN caches.
  const cacheBustedUrl = `${uploaded.url}?t=${Date.now()}`;
  // GIF framing ("x,y,scale") — kept only for GIF avatars; a static upload clears it.
  const rawPos = (formData.get('pos') as string | null) ?? null;
  const avatarPos = isGif && rawPos ? rawPos.slice(0, 40) : null;

  // Update only avatar_url + avatar_pos — do NOT upsert (would wipe other fields if row missing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('profiles')
    .update({ avatar_url: cacheBustedUrl, avatar_pos: avatarPos, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  revalidatePath('/', 'layout');

  return { url: cacheBustedUrl };
}

export async function uploadBanner(formData: FormData): Promise<{ url: string | null; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { url: null, error: 'Unauthorized' };

  const file = formData.get('banner') as File | null;
  if (!file || file.size === 0) return { url: null, error: 'No file' };

  // Animated GIF banners are a Super Prosto perk — verify server-side.
  const isGif = file.type === 'image/gif';
  if (isGif) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any).from('profiles').select('is_premium').eq('id', user.id).maybeSingle();
    if (!prof?.is_premium) return { url: null, error: 'premium_required' };
  }
  const maxBytes = isGif ? 15 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.size > maxBytes) return { url: null, error: 'File too large' };

  const bannerKey = `banner/${user.id}.${extOf(file)}`;
  let uploaded;
  try {
    uploaded = await uploadFile(BUCKETS.avatars, bannerKey, file);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[uploadBanner]', e);
    return { url: null, error: 'Upload failed' };
  }

  const cacheBustedUrl = `${uploaded.url}?t=${Date.now()}`;
  // GIF framing ("x,y,scale") — kept only for GIF banners; a static upload clears it.
  const rawPos = (formData.get('pos') as string | null) ?? null;
  const bannerPos = isGif && rawPos ? rawPos.slice(0, 40) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('profiles')
    .update({ banner_url: cacheBustedUrl, banner_pos: bannerPos, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  revalidatePath('/', 'layout');

  return { url: cacheBustedUrl };
}
