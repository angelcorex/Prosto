import { createClient } from '@/lib/supabase/server';

export interface ServerInvitePreview {
  server_id: string;
  public_id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  is_verified?: boolean;
  description?: string | null;
  tags?: string[] | null;
  member_count: number;
  online_count?: number;
  inviter_username: string;
}

/** Load a server-invite preview by its (short) token. */
export async function loadServerInvite(token: string): Promise<ServerInvitePreview | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('get_server_invite', { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}
