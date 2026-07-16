export interface GroupMember {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
  is_bot?: boolean;
  status?: string | null;
  last_seen?: string | null;
  is_owner?: boolean;
}

export interface GroupInfo {
  conversationId: string;
  publicId: string;
  name: string | null;
  avatar: string | null;
  memberCount: number;
}
