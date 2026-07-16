'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Settings server actions — thin wrappers over the privacy / notify-prefs RPCs
 * (migrations 117–118). All logic + auth live in the security-definer functions.
 */

export type PrivacyLevel = 'everyone' | 'friends' | 'nobody';

export interface PrivacySettings {
  privacy_profile: PrivacyLevel;
  privacy_messages: PrivacyLevel;
  privacy_friend_req: PrivacyLevel;
}

export interface NotifyPrefs {
  sound_enabled: boolean;
  dm_sound: boolean;
  server_sound: boolean;
  mention_sound: boolean;
  friend_sound: boolean;
  toasts_enabled: boolean;
}

/** Update one or more privacy levels (unset fields are left unchanged). */
export async function setPrivacySettings(patch: Partial<PrivacySettings>): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('set_privacy_settings', {
    p_profile: patch.privacy_profile ?? null,
    p_messages: patch.privacy_messages ?? null,
    p_friend_req: patch.privacy_friend_req ?? null,
  });
  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[setPrivacySettings]', error.message);
    return { error: 'generic' };
  }
  return { ok: true };
}

/** Update one or more global notification prefs (unset fields unchanged). */
export async function setNotifyPrefs(patch: Partial<NotifyPrefs>): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('set_notify_prefs', {
    p_sound_enabled: patch.sound_enabled ?? null,
    p_dm_sound: patch.dm_sound ?? null,
    p_server_sound: patch.server_sound ?? null,
    p_mention_sound: patch.mention_sound ?? null,
    p_friend_sound: patch.friend_sound ?? null,
    p_toasts_enabled: patch.toasts_enabled ?? null,
  });
  if (error) {
    if (process.env.NODE_ENV === 'development') console.error('[setNotifyPrefs]', error.message);
    return { error: 'generic' };
  }
  return { ok: true };
}
