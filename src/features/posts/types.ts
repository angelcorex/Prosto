export interface PostAuthor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
}

import type { ChatAttachment } from '@/lib/utils/media';

export interface Post {
  id: string;
  content: string;
  imageUrl: string | null;
  /** Media attached to the post (images, videos, files). Empty when none. */
  attachments: ChatAttachment[];
  created_at: string;
  isEdited: boolean;
  /** Age-restricted (18+) — gated/blurred until revealed by an adult. */
  isNsfw: boolean;
  author: PostAuthor;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  liked: boolean;
  reposted: boolean;
  /** Set when this feed entry is a repost — who reposted it. */
  reposter?: { username: string; display_name: string | null } | null;
}

export interface PostComment {
  id: string;
  /** Parent comment id for threaded replies; null for a top-level comment. */
  parentId: string | null;
  content: string;
  created_at: string;
  author: PostAuthor;
}

export interface CreatePostState {
  error?: string;
  success?: boolean;
}
