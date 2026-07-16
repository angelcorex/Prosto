import { parsePostAttachments } from '@/lib/utils/media';
import type { Post } from '../types';

/** Maps a row from `get_feed_posts` / `get_user_posts` into a Post. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapFeedRow(r: any): Post {
  return {
    id:         r.id,
    content:    r.content,
    imageUrl:   r.image_url ?? null,
    attachments: parsePostAttachments(r.attachments, r.image_url, r.content),
    created_at: r.created_at,
    isEdited:   !!r.is_edited,
    isNsfw:     !!r.is_nsfw,
    author: {
      username:     r.author_username,
      display_name: r.author_display_name,
      avatar_url:   r.author_avatar_url,
      is_verified:  !!r.author_is_verified,
      is_moderator: !!r.author_is_moderator,
      is_premium:   !!r.author_is_premium,
    },
    likeCount:   Number(r.like_count ?? 0),
    commentCount: Number(r.comment_count ?? 0),
    repostCount: Number(r.repost_count ?? 0),
    viewCount:   Number(r.view_count ?? 0),
    liked:       !!r.liked,
    reposted:    !!r.reposted,
    reposter: r.reposter_username
      ? { username: r.reposter_username, display_name: r.reposter_display_name ?? null }
      : null,
  };
}
