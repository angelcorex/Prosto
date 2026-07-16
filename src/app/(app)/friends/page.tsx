import { createClient } from '@/lib/supabase/server';
import { FriendsClient } from './friends-client';

export interface FriendUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
  status?: string | null;
  last_seen?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(id: string, p: any): FriendUser {
  const prof = Array.isArray(p) ? p[0] : p;
  return {
    id,
    username:     prof?.username     ?? '',
    display_name: prof?.display_name ?? null,
    avatar_url:   prof?.avatar_url   ?? null,
    is_verified:  prof?.is_verified  ?? false,
    is_moderator: prof?.is_moderator ?? false,
    is_premium:   prof?.is_premium   ?? false,
    status:       prof?.status,
    last_seen:    prof?.last_seen,
  };
}

export default async function FriendsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const myId = user.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from('friend_requests')
    .select(`from_id, to_id, status,
      from:profiles!friend_requests_from_id_fkey(username, display_name, avatar_url, is_verified, is_moderator, is_premium, status, last_seen),
      to:profiles!friend_requests_to_id_fkey(username, display_name, avatar_url, is_verified, is_moderator, is_premium, status, last_seen)`)
    .or(`from_id.eq.${myId},to_id.eq.${myId}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = rows ?? [];

  const friends = all
    .filter(r => r.status === 'accepted')
    .map(r => (r.from_id === myId ? normalize(r.to_id, r.to) : normalize(r.from_id, r.from)));

  const incoming = all
    .filter(r => r.status === 'pending' && r.to_id === myId)
    .map(r => normalize(r.from_id, r.from));

  const outgoing = all
    .filter(r => r.status === 'pending' && r.from_id === myId)
    .map(r => normalize(r.to_id, r.to));

  return <FriendsClient friends={friends} incoming={incoming} outgoing={outgoing} />;
}
