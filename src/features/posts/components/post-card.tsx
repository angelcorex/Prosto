'use client';

import { useState, useRef, useEffect } from 'react';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Heart, MessageCircle, Repeat2, MoreHorizontal, Trash2, Repeat, Eye, Pencil, Smile, Share2, Check } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { imageUrlOf } from '@/lib/utils/media';
import { VerifiedBadge, MiniProfilePopup, ModeratorBadge, PremiumBadge, EmojiPicker, EmojiText, renderEmojiNodes, ChatAlbum, ChatMedia, LinkPreview } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { useImageViewer } from '@/features/media';
import { NsfwGate } from '@/features/age';
import { CommentSection } from '@/features/comments';
import { ReactionBar, type ReactionGroup } from '@/components/ui/reaction-bar';
import { toggleLike, toggleRepost, deletePost, editPost, recordPostView, togglePostReaction } from '../api/actions';
import { PostText } from './post-text';
import type { Post } from '../types';

interface PostCardProps {
  post: Post;
  locale: string;
  currentUsername?: string | null;
}

export function PostCard({ post, locale, currentUsername }: PostCardProps) {
  const t  = useT('posts');
  const imageViewer = useImageViewer();
  const { author } = post;
  const initial     = (author.display_name ?? author.username)[0]?.toUpperCase() ?? '?';
  const displayName = author.display_name ?? author.username;
  const timeAgo     = formatTimeAgo(post.created_at, locale);
  const legacyMedia = imageUrlOf(post.content);
  const text        = legacyMedia ? '' : post.content.trim();
  const attachments = post.attachments;
  const imageUrls   = attachments.filter((a) => a.kind === 'image').map((a) => a.url);
  // Spoilered media falls back to the per-item ChatMedia stack (the album grid
  // can't blur individual tiles), so each spoiler tile blurs on its own.
  const asAlbum     = attachments.length >= 2 && attachments.every((a) => a.kind === 'image') && !attachments.some((a) => a.spoiler);

  const [liked,        setLiked]        = useState(post.liked);
  const [likeCount,    setLikeCount]    = useState(post.likeCount);
  const [reposted,     setReposted]     = useState(post.reposted);
  const [repostCount,  setRepostCount]  = useState(post.repostCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [viewCount,    setViewCount]    = useState(post.viewCount);
  const [showComments, setShowComments] = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [deleted,      setDeleted]      = useState(false);
  const [editing,      setEditing]      = useState(false);
  const [editText,     setEditText]     = useState(text);
  const [editError,    setEditError]    = useState<string | null>(null);
  const [editSaving,   setEditSaving]   = useState(false);
  const [currentText,  setCurrentText]  = useState(text);
  const [isEdited,     setIsEdited]     = useState(post.isEdited);
  const [reactions,    setReactions]    = useState<ReactionGroup[]>([]);
  const [shared,       setShared]       = useState(false);

  const sbRef      = useRef(createClient());
  const articleRef = useRef<HTMLElement>(null);
  const viewedRef  = useRef(false);
  const isOwn      = !!currentUsername && currentUsername === author.username;

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('get_post_reactions', { p_post: post.id }).then(({ data }: any) => {
      if (!active || !Array.isArray(data)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setReactions(data.map((r: any) => ({ emoji: r.emoji, count: Number(r.reaction_count), reacted: !!r.reacted })));
    });
    return () => { active = false; };
  }, [post.id]);

  useEffect(() => {
    const el = articleRef.current;
    if (!el || viewedRef.current) return;
    const key = `pv:${post.id}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) { viewedRef.current = true; return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !viewedRef.current) {
        viewedRef.current = true;
        sessionStorage?.setItem(key, '1');
        setViewCount((c) => c + 1);
        recordPostView(post.id);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id]);

  const popupUser = { username: author.username, display_name: author.display_name, avatar_url: author.avatar_url, is_verified: author.is_verified };

  async function onLike() {
    const next = !liked;
    setLiked(next); setLikeCount((c) => c + (next ? 1 : -1));
    const res = await toggleLike(post.id);
    if (res.error) { setLiked(!next); setLikeCount((c) => c + (next ? -1 : 1)); }
    else if (typeof res.liked === 'boolean' && res.liked !== next) {
      setLiked(res.liked); setLikeCount((c) => c + (res.liked ? 1 : -1) - (next ? 1 : -1));
    }
  }

  async function onRepost() {
    const next = !reposted;
    setReposted(next); setRepostCount((c) => c + (next ? 1 : -1));
    const res = await toggleRepost(post.id);
    if (res.error) { setReposted(!next); setRepostCount((c) => c + (next ? -1 : 1)); }
  }

  async function onShare() {
    const url = `${window.location.origin}/post/${post.id}`;
    // Native share sheet where available (mobile / PWA); otherwise copy the link.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: `@${author.username}`, url }); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  async function onDelete() { setMenuOpen(false); setDeleted(true); await deletePost(post.id); }

  async function onEditSave() {
    const body = editText.trim();
    if (!body || body === currentText) { setEditing(false); return; }
    setEditSaving(true); setEditError(null);
    const res = await editPost(post.id, body);
    setEditSaving(false);
    if (res.error) { setEditError(res.error); return; }
    setCurrentText(body); setIsEdited(true); setEditing(false);
  }

  function onEditStart() { setEditText(currentText); setEditError(null); setMenuOpen(false); setEditing(true); }

  async function onToggleReaction(emoji: string) {
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      setReactions((prev) => prev.map((r) => r.emoji === emoji ? { ...r, count: r.reacted ? r.count - 1 : r.count + 1, reacted: !r.reacted } : r).filter((r) => r.count > 0));
    } else {
      setReactions((prev) => [...prev, { emoji, count: 1, reacted: true }]);
    }
    const res = await togglePostReaction(post.id, emoji);
    if (res.error) setReactions((prev) => existing ? prev.map((r) => r.emoji === emoji ? existing : r) : prev.filter((r) => r.emoji !== emoji));
  }

  if (deleted) return null;

  return (
    <article
      ref={articleRef}
      className="group/post relative border-b border-border/20 px-4 py-4 transition-colors duration-100 hover:bg-foreground/[0.02]"
    >
      {/* Repost label */}
      {post.reposter && (() => {
        const rawName = post.reposter!.display_name ?? post.reposter!.username;
        const [before, after] = t('actions.repostedBy', { name: '\u0000' }).split('\u0000');
        return (
          <div className="mb-2.5 flex items-center gap-1.5 pl-11 text-[12px] text-muted-foreground/70">
            <Repeat className="h-3 w-3 shrink-0" />
            <span>{before}{renderEmojiNodes(rawName)}{after ?? ''}</span>
          </div>
        );
      })()}

      <div className="flex gap-3">
        {/* Avatar column */}
        <div className="flex shrink-0 flex-col items-center">
          <MiniProfilePopup user={popupUser}>
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-foreground/10 ring-1 ring-border/30">
              {author.avatar_url ? (
                <AvatarImage src={author.avatar_url} alt={displayName} sizes="32px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[12px] font-bold text-foreground/50">{initial}</span>
              )}
            </div>
          </MiniProfilePopup>
        </div>

        {/* Content column */}
        <div className="min-w-0 flex-1">
          {/* Header: name · @handle · time · menu */}
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0">
              <MiniProfilePopup user={popupUser}>
                <span className={cn('text-[14px] font-semibold leading-tight hover:underline cursor-pointer', author.is_premium && 'aurora-text aurora-text-glow')}>
                  <EmojiText content={displayName} clamp />
                </span>
              </MiniProfilePopup>
              {author.is_verified  && <VerifiedBadge  size="sm" />}
              {author.is_moderator && <ModeratorBadge size="sm" />}
              {author.is_premium   && <PremiumBadge   size="sm" />}
              <span className="text-[13px] text-muted-foreground/70">@{author.username}</span>
              <span className="text-[13px] text-muted-foreground/40">·</span>
              <time
                dateTime={post.created_at}
                className="text-[13px] text-muted-foreground/70"
                title={new Date(post.created_at).toLocaleString(locale)}
              >
                {timeAgo}
              </time>
              {isEdited && <span className="text-[11px] text-muted-foreground/30">{t('actions.edited')}</span>}
            </div>

            {isOwn && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label="More"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="touch-reveal flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/40 opacity-0 transition-opacity group-hover/post:opacity-100 hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="surface-solid absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-border/40 py-1 shadow-xl">
                      <button type="button" onClick={onEditStart} className="flex w-full items-center gap-2.5 px-4 py-3 text-[14px] hover:bg-accent md:py-2 md:text-[13px]">
                        <Pencil className="h-4 w-4" />{t('actions.edit')}
                      </button>
                      <button type="button" onClick={onDelete} className="flex w-full items-center gap-2.5 px-4 py-3 text-[14px] text-destructive hover:bg-destructive/10 md:py-2 md:text-[13px]">
                        <Trash2 className="h-4 w-4" />{t('actions.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Body */}
          {editing ? (
            <div className="mb-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={500}
                rows={3}
                autoFocus
                className="w-full resize-none rounded-lg border border-border/40 bg-accent/40 px-3 py-2 text-[14px] text-foreground outline-none focus:border-foreground/30"
              />
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground/50">{editText.length}/500</span>
                {editError && <span className="text-[12px] text-destructive">{editError}</span>}
                <button type="button" onClick={onEditSave} disabled={editSaving || !editText.trim()} className="ml-auto rounded-md bg-foreground px-3 py-1 text-[12px] font-medium text-background disabled:opacity-40">
                  {editSaving ? '…' : t('actions.save')}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-md px-3 py-1 text-[12px] text-muted-foreground hover:text-foreground">
                  {t('actions.cancel')}
                </button>
              </div>
            </div>
          ) : (
            currentText && <PostText content={currentText} className="mb-2 text-[14px] leading-relaxed" />
          )}

          {/* Media */}
          {attachments.length > 0 && !editing && (() => {
            const media = (
              <div className="overflow-hidden rounded-2xl">
                {asAlbum ? (
                  <ChatAlbum
                    urls={imageUrls}
                    onOpen={(url) => imageViewer.open({ src: url, authorName: displayName, authorAvatar: author.avatar_url, subtitle: `@${author.username}` })}
                  />
                ) : (
                  <ChatMedia
                    attachments={attachments}
                    onOpen={(url) => imageViewer.open({ src: url, authorName: displayName, authorAvatar: author.avatar_url, subtitle: `@${author.username}` })}
                  />
                )}
              </div>
            );
            return (
              <div className="mb-2.5">
                {post.isNsfw ? <NsfwGate full>{media}</NsfwGate> : media}
              </div>
            );
          })()}

          {/* Link preview — text posts with a URL and no media of their own. */}
          {!editing && attachments.length === 0 && currentText && (
            <div className="mb-2.5">
              <LinkPreview content={currentText} />
            </div>
          )}

          {/* Actions */}
          <div className="-ml-2 mt-0.5 flex items-center">
            {/* Like */}
            <ActionBtn
              onClick={onLike}
              active={liked}
              activeClass="text-rose-500"
              hoverClass="hover:text-rose-500"
              count={likeCount}
              icon={<Heart className={cn('h-[17px] w-[17px]', liked && 'fill-current')} />}
            />
            {/* Comment */}
            <ActionBtn
              onClick={() => setShowComments((v) => !v)}
              active={showComments}
              activeClass="text-link"
              hoverClass="hover:text-link"
              count={commentCount}
              icon={<MessageCircle className="h-[17px] w-[17px]" />}
            />
            {/* Repost */}
            <ActionBtn
              onClick={onRepost}
              active={reposted}
              activeClass="text-emerald-500"
              hoverClass="hover:text-emerald-500"
              count={repostCount}
              icon={<Repeat2 className="h-[17px] w-[17px]" />}
            />
            {/* Share */}
            <ActionBtn
              onClick={onShare}
              active={shared}
              activeClass="text-link"
              hoverClass="hover:text-link"
              count={0}
              title={shared ? t('actions.linkCopied') : t('actions.share')}
              icon={shared ? <Check className="h-[17px] w-[17px]" /> : <Share2 className="h-[17px] w-[17px]" />}
            />
            {/* Emoji reaction */}
            <EmojiPicker onSelect={onToggleReaction}>
              <span className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-link md:h-8 md:w-8">
                <Smile className="h-[17px] w-[17px]" />
              </span>
            </EmojiPicker>

            {/* Right side: reactions + views */}
            <div className="ml-auto flex items-center gap-2.5">
              {reactions.length > 0 && (
                <ReactionBar reactions={reactions} onToggle={onToggleReaction} canReact showAdd={false} />
              )}
              <span className="flex items-center gap-1 text-[12px] text-muted-foreground/50">
                <Eye className="h-[14px] w-[14px]" />
                {formatCount(viewCount)}
              </span>
            </div>
          </div>

          {/* Comments */}
          {(commentCount > 0 || showComments) && (
            <CommentSection
              postId={post.id}
              initialCount={post.commentCount}
              open={showComments}
              onOpen={() => setShowComments(true)}
              onCountChange={(d) => setCommentCount((c) => c + d)}
            />
          )}
        </div>
      </div>
    </article>
  );
}

/* Action button with count — 40px touch target on mobile, compact on desktop */
function ActionBtn({ onClick, active, activeClass, hoverClass, count, icon, title }: {
  onClick: () => void;
  active: boolean;
  activeClass: string;
  hoverClass: string;
  count: number;
  icon: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'flex h-10 min-w-[40px] items-center gap-1 rounded-full px-2.5 text-[13px] tabular-nums transition-colors duration-100 md:h-8 md:px-2',
        active ? activeClass : cn('text-muted-foreground/70', hoverClass),
      )}
    >
      {icon}
      {count > 0 && <span>{formatCount(count)}</span>}
    </button>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTimeAgo(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (s < 60)  return rtf.format(-s, 'second');
  if (m < 60)  return rtf.format(-m, 'minute');
  if (h < 24)  return rtf.format(-h, 'hour');
  if (d < 7)   return rtf.format(-d, 'day');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(dateStr));
}
