'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, ChevronDown, ChevronRight, CornerUpLeft } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { MiniProfilePopup, VerifiedBadge, ModeratorBadge, PremiumBadge, renderEmojiNodes } from '@/components/ui';
import { PostText, type PostComment } from '@/features/posts';
import { AvatarImage } from '@/components/ui/avatar-image';
import { addComment } from '../api/actions';

interface CommentSectionProps {
  postId: string;
  /** Comment count from the feed row — gates the lazy fetch (0 → never fetch). */
  initialCount?: number;
  /** Expanded: full Reddit-style thread + composer. Collapsed: preview first 3. */
  open?: boolean;
  /** Fired by the "show more" link to expand the section. */
  onOpen?: () => void;
  onCountChange?: (delta: number) => void;
}

/** Top-level comments shown before "show more". */
const PREVIEW = 3;
/** Stop deepening the indent past this level so deep chains stay readable. */
const MAX_INDENT = 6;

interface CommentNode extends PostComment {
  children: CommentNode[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapComment(r: any): PostComment {
  return {
    id: r.id,
    parentId: r.parent_id ?? null,
    content: r.content,
    created_at: r.created_at,
    author: {
      username: r.author_username,
      display_name: r.author_display_name,
      avatar_url: r.author_avatar_url,
      is_verified: !!r.author_is_verified,
      is_moderator: !!r.author_is_moderator,
      is_premium: !!r.author_is_premium,
    },
  };
}

/** Build the reply tree from the flat, chronologically-ordered list. */
function buildTree(flat: PostComment[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];
  for (const c of flat) byId.set(c.id, { ...c, children: [] });
  for (const c of flat) {
    const node = byId.get(c.id)!;
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function countDescendants(node: CommentNode): number {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);
}

export function CommentSection({ postId, initialCount = 0, open = false, onOpen, onCountChange }: CommentSectionProps) {
  const t = useT('posts');
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const sbRef = useRef(createClient());
  const rootRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sbRef.current as any).rpc('get_post_comments', { post: postId });
    setComments((data ?? []).map(mapComment));
    setLoaded(true);
  }

  // Lazy-load: fetch a post's comments only when it nears the viewport, and
  // only if it actually has some — so the feed doesn't fire a request per post.
  useEffect(() => {
    if (loaded || initialCount === 0) return;
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { obs.disconnect(); void load(); }
    }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, initialCount, postId]);

  // Opening the section: make sure comments are loaded, then focus the composer.
  useEffect(() => {
    if (!open) return;
    if (!loaded) void load();
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Post a comment or reply, then refresh the thread. Returns success. */
  async function submitComment(text: string, parentId: string | null): Promise<boolean> {
    const body = text.trim();
    if (!body) return false;
    const res = await addComment(postId, body, parentId);
    if (!res.success) return false;
    onCountChange?.(1);
    await load();
    return true;
  }

  async function submitRoot(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    setValue('');
    await submitComment(text, null);
    setSending(false);
  }

  const tree = useMemo(() => buildTree(comments), [comments]);
  const shownRoots = open ? tree : tree.slice(0, PREVIEW);
  const hasBody = comments.length > 0 || open;

  return (
    <div ref={rootRef} className={cn(hasBody && 'mt-3 border-t border-border/40 pt-3')}>
      {shownRoots.length > 0 && (
        <div className="flex flex-col gap-3">
          {open
            ? shownRoots.map((node) => (
                <CommentThread key={node.id} node={node} depth={0} onReply={submitComment} />
              ))
            : shownRoots.map((node) => (
                <div key={node.id}>
                  <CommentItem comment={node} />
                  {node.children.length > 0 && (
                    <button
                      type="button"
                      onClick={onOpen}
                      className="ml-[42px] mt-1 text-[12px] font-semibold text-link/80 transition-colors hover:text-link"
                    >
                      {t('comments.replies', { count: countDescendants(node) })}
                    </button>
                  )}
                </div>
              ))}
        </div>
      )}

      {/* Collapsed preview → reveal the full thread (Reddit-style). */}
      {!open && comments.length > shownRoots.length && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('comments.viewAll', { count: comments.length })}
        </button>
      )}

      {/* Expanded: empty hint (if none) + the root composer. */}
      {open && (
        <>
          {loaded && comments.length === 0 && (
            <p className="py-1 text-[13px] text-muted-foreground/60">{t('comments.empty')}</p>
          )}
          <form onSubmit={submitRoot} className="mt-3 flex items-center gap-2">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={500}
              placeholder={t('comments.placeholder')}
              className="min-w-0 flex-1 rounded-full bg-secondary/60 px-4 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:bg-secondary/80"
            />
            <button
              type="submit"
              disabled={!value.trim() || sending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              aria-label={t('comments.submit')}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/**
 * One node of the Reddit-style thread: the comment, a reply/collapse control
 * row, an optional inline reply composer, then its nested children behind a
 * thread line. Children collapse into a "show N replies" toggle.
 */
function CommentThread({
  node,
  depth,
  onReply,
}: {
  node: CommentNode;
  depth: number;
  onReply: (text: string, parentId: string) => Promise<boolean>;
}) {
  const t = useT('posts');
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const hasChildren = node.children.length > 0;

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await onReply(text, node.id);
    setSending(false);
    if (ok) { setReplyText(''); setReplying(false); }
  }

  return (
    <div className="flex flex-col">
      <CommentItem comment={node} />

      {/* Control row — aligned under the comment bubble (past the 32px avatar). */}
      <div className="ml-[42px] mt-1 flex items-center gap-4 text-[12px] font-semibold text-muted-foreground">
        <button
          type="button"
          onClick={() => setReplying((v) => !v)}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
          {t('comments.reply')}
        </button>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {collapsed ? t('comments.showReplies', { count: countDescendants(node) }) : t('comments.hideReplies')}
          </button>
        )}
      </div>

      {replying && (
        <form onSubmit={submitReply} className="ml-[42px] mt-2 flex items-center gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            maxLength={500}
            autoFocus
            placeholder={t('comments.replyPlaceholder')}
            className="min-w-0 flex-1 rounded-full bg-secondary/60 px-4 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:bg-secondary/80"
          />
          <button
            type="submit"
            disabled={!replyText.trim() || sending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            aria-label={t('comments.submit')}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {hasChildren && !collapsed && (
        <div
          className={cn(
            'mt-2 flex flex-col gap-3 border-l border-border/50',
            depth < MAX_INDENT ? 'ml-4 pl-3' : 'ml-1 pl-2',
          )}
        >
          {node.children.map((child) => (
            <CommentThread key={child.id} node={child} depth={depth + 1} onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment }: { comment: PostComment }) {
  const { author } = comment;
  const name = author.display_name ?? author.username;
  const initial = name[0]?.toUpperCase() ?? '?';
  const popupUser = { username: author.username, display_name: author.display_name, avatar_url: author.avatar_url, is_verified: author.is_verified };

  return (
    <div className="flex gap-2.5">
      <MiniProfilePopup user={popupUser} className="shrink-0">
        <div className="relative h-8 w-8 overflow-hidden rounded-full bg-link/20">
          {author.avatar_url
            ? <AvatarImage src={author.avatar_url} alt={name} className="object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{initial}</span>}
        </div>
      </MiniProfilePopup>
      <div className="min-w-0 flex-1 rounded-2xl bg-secondary/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <span className={author.is_premium ? 'text-[13px] font-semibold aurora-text aurora-text-glow' : 'text-[13px] font-semibold'}>{renderEmojiNodes(name)}</span>
          {author.is_verified && <VerifiedBadge size="sm" />}
          {author.is_moderator && <ModeratorBadge size="sm" />}
          {author.is_premium && <PremiumBadge size="sm" />}
        </div>
        <PostText content={comment.content} className="mb-0 whitespace-pre-wrap break-words text-[14px] leading-snug text-foreground/90" />
      </div>
    </div>
  );
}
