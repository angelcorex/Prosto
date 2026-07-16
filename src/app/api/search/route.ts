import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { limitRequest } from '@/lib/rate-limit/ip';
import { parsePostAttachments } from '@/lib/utils/media';

/** Max query length we accept — long inputs only make the scan more expensive. */
const MAX_QUERY = 64;

/**
 * Neutralize characters that are meaningful in PostgREST filter strings
 * (`, . ( ) :`) and in LIKE patterns (`% _ *` and `\`). Without this, a query
 * interpolated into `.or('col.ilike.%<q>%')` could break out of the filter and
 * inject conditions, and `%`/`_` could force pathological full-table scans.
 */
function sanitizeQuery(q: string): string {
  return q.replace(/[,.()*:%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * GET /api/search?q=<query>&type=all|people|posts
 *
 * Returns up to 10 people and 20 posts matching the query.
 */
export async function GET(request: NextRequest) {
  const limited = limitRequest(request, 'search', 30, 10_000);
  if (limited) return limited;

  const raw  = request.nextUrl.searchParams.get('q')?.trim().slice(0, MAX_QUERY) ?? '';
  const type = request.nextUrl.searchParams.get('type') ?? 'all';
  const q    = sanitizeQuery(raw);

  if (!q) {
    return NextResponse.json({ people: [], posts: [] });
  }

  const supabase = await createClient();
  const term = `%${q}%`;

  const [peopleResult, aliasResult, postsResult] = await Promise.all([
    // People — search by username or display_name
    type !== 'posts'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
          .from('profiles')
          .select('username, display_name, avatar_url, is_verified, is_moderator, bio')
          .or(`username.ilike.${term},display_name.ilike.${term}`)
          .limit(10)
      : { data: [] },

    // People — also match Super Prosto additional usernames (aliases). The
    // owner profile is returned so an alias hit surfaces the real person; the
    // matched alias rides along so the UI can show why it matched.
    type !== 'posts'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
          .from('profile_usernames')
          .select('username, owner:profiles!profile_usernames_profile_id_fkey (username, display_name, avatar_url, is_verified, is_moderator, bio)')
          .ilike('username', term)
          .limit(10)
      : { data: [] },

    // Posts — search in content, join author profile
    type !== 'people'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
          .from('posts')
          .select(`
            id,
            content,
            image_url,
            attachments,
            is_edited,
            is_nsfw,
            created_at,
            author:profiles!posts_author_id_fkey (
              username,
              display_name,
              avatar_url,
              is_verified,
              is_moderator,
              is_premium
            )
          `)
          .ilike('content', term)
          .order('created_at', { ascending: false })
          .limit(20)
      : { data: [] },
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts = (postsResult.data ?? []).map((p: any) => {
    const author = Array.isArray(p.author) ? p.author[0] : p.author;
    return {
      id:         p.id,
      content:    p.content,
      // Render media inline (image/video/gallery) instead of the bare URL that
      // media posts carry as their content — parse the same way the feed does.
      imageUrl:   p.image_url ?? null,
      attachments: parsePostAttachments(p.attachments, p.image_url, p.content),
      isEdited:   !!p.is_edited,
      isNsfw:     !!p.is_nsfw,
      created_at: p.created_at,
      author,
    };
  });

  // Merge direct profile hits with alias hits, deduped by the owner's canonical
  // username (an alias match for someone already found by name/username adds
  // nothing). Direct hits rank first; capped at 10.
  const byUsername = new Map<string, any>();
  for (const person of peopleResult.data ?? []) {
    if (person?.username) byUsername.set(person.username, person);
  }
  for (const row of aliasResult.data ?? []) {
    const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
    if (owner?.username && !byUsername.has(owner.username)) {
      byUsername.set(owner.username, { ...owner, matchedUsername: row.username });
    }
  }
  const people = Array.from(byUsername.values()).slice(0, 10);

  return NextResponse.json({ people, posts });
}
