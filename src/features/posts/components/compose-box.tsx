'use client';

import { useActionState, useEffect, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Film, X, Hash, Paperclip, Play, FileText, Eye, EyeOff, Pencil } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { Button, GifPicker, UploadProgressRing, Tooltip, EmojiPicker } from '@/components/ui';
import { Smile } from 'lucide-react';
import { uploadLimitBytes, uploadLimitMb, MAX_CHAT_IMAGES } from '@/lib/utils/media';
import { uploadDirect } from '@/features/media';
import { resolveEmojiShortcodes } from '@/lib/emoji';
import { createPost } from '../api/actions';
import type { CreatePostState } from '../types';

interface ComposeBoxProps {
  avatarUrl?: string | null;
  username: string;
  /** Super Prosto subscriber — raises the client-side upload size cap. */
  isPremium?: boolean;
  /** `inline` (feed card, default) or `fullscreen` (mobile composer sheet). */
  variant?: 'inline' | 'fullscreen';
  /** Called after a post is successfully published (fullscreen sheet closes). */
  onPosted?: () => void;
}

type AttKind = 'image' | 'video' | 'file';

/** Persisted post attachment shape (mirrors the `attachments` JSONB entries). */
interface PostAttachment {
  url: string;
  kind: AttKind;
  name?: string;
  spoiler?: boolean;
  nsfw?: boolean;
}

interface PendingAttachment {
  id: string;
  kind: AttKind;
  /** blob: preview (local files) or the remote GIF URL. */
  previewUrl: string;
  /** Present for local files that still need uploading; absent for remote GIFs. */
  file?: File;
  /** Already-hosted URL (GIFs) — no upload needed. */
  remoteUrl?: string;
  name?: string;
  /** Hide behind a blur in the published post until clicked (spoiler). */
  spoiler?: boolean;
  /** Age-restricted (18+) — gated by viewer age in the published post. */
  nsfw?: boolean;
}

const emptyState: CreatePostState = {};

/** Compact count, e.g. 41800 → "41.8K". */
function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

function kindOfType(type: string): AttKind {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * Attachment editor — a modal overlay (portal, on top of everything) opened by
 * the pencil. Edits the filename and toggles the 18+ (age-restricted) flag for
 * this single image, rather than an in-flow panel inside the composer.
 */
function AttachmentEditor({
  initialName,
  initialNsfw,
  filenameLabel,
  nsfwLabel,
  saveLabel,
  cancelLabel,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialNsfw: boolean;
  filenameLabel: string;
  nsfwLabel: string;
  saveLabel: string;
  cancelLabel: string;
  onSave: (name: string, nsfw: boolean) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const [nsfw, setNsfw] = useState(initialNsfw);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 animate-fade-in" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl border border-border/40 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <label className="mb-1 block text-[12px] font-semibold text-muted-foreground">{filenameLabel}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onSave(value, nsfw); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          maxLength={200}
          className="w-full rounded-xl border border-border/50 bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-link"
        />
        <button
          type="button"
          onClick={() => setNsfw((v) => !v)}
          aria-pressed={nsfw}
          className={cn(
            'mt-3 flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors',
            nsfw ? 'border-destructive/60 bg-destructive/5' : 'border-border/50 hover:bg-accent/40',
          )}
        >
          <span className="text-[13px] font-medium text-foreground">{nsfwLabel}</span>
          <span className={cn('flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', nsfw ? 'bg-destructive' : 'bg-muted')}>
            <span className={cn('h-5 w-5 rounded-full bg-white transition-transform', nsfw && 'translate-x-5')} />
          </span>
        </button>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => onSave(value, nsfw)} className="rounded-lg bg-link px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:opacity-90">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ComposeBox({ avatarUrl, username, isPremium, variant = 'inline', onPosted }: ComposeBoxProps) {
  const t = useT('posts');
  const isFullscreen = variant === 'fullscreen';
  const ta = useT('age');
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createPost, emptyState);
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Per-item upload progress (0–100). Key = item id. */
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  /** Id of the attachment being edited (filename + 18+ modal open). */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Live character count for the counter (textarea is uncontrolled). */
  const [len, setLen] = useState(0);
  const fileRef     = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initial     = username[0]?.toUpperCase() ?? '?';

  // Track blob: URLs we create so we can release them (no memory leak).
  const blobUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const created = blobUrls.current;
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // ── Hashtag autocomplete ──
  const sbRef = useRef(createClient());
  const [tag, setTag] = useState<{ q: string; start: number } | null>(null);
  const [tagItems, setTagItems] = useState<{ tag: string; post_count: number }[]>([]);
  const [tagIdx, setTagIdx] = useState(0);

  // Clear the composer once a post is published.
  useEffect(() => {
    if (!state.success) return;
    setItems((prev) => {
      prev.forEach((it) => { if (it.file) { URL.revokeObjectURL(it.previewUrl); blobUrls.current.delete(it.previewUrl); } });
      return [];
    });
    setUploadError(null);
    setTag(null);
    setLen(0);
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
    // Pull the freshly published post into the feed/profile without a manual
    // reload (the server action already revalidated the cached data).
    router.refresh();
    // Fullscreen sheet: dismiss itself once the post lands.
    onPosted?.();
  }, [state.success, router, onPosted]);

  // Fetch tag suggestions (debounced) — empty prefix returns trending tags.
  useEffect(() => {
    if (!tag) { setTagItems([]); return; }
    const id = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sbRef.current as any).rpc('suggest_hashtags', { p_prefix: tag.q, lim: 6 });
      setTagItems(Array.isArray(data) ? data : []);
      setTagIdx(0);
    }, 150);
    return () => clearTimeout(id);
  }, [tag]);

  function detectHashtag(el: HTMLTextAreaElement) {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const m = before.match(/(?:^|\s)#([0-9A-Za-zА-Яа-яЁё_]*)$/);
    if (m) setTag({ q: m[1] ?? '', start: caret - (m[1]?.length ?? 0) - 1 });
    else setTag(null);
  }

  function applyTag(value: string) {
    const el = textareaRef.current;
    if (!el || !tag) return;
    const caret = el.selectionStart ?? el.value.length;
    const insert = `#${value} `;
    el.value = el.value.slice(0, tag.start) + insert + el.value.slice(caret);
    const pos = tag.start + insert.length;
    el.setSelectionRange(pos, pos);
    el.focus();
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    setLen(el.value.length);
    setTag(null);
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    setLen(el.value.length);
    detectHashtag(el);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!tag || tagItems.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setTagIdx((i) => (i + 1) % tagItems.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setTagIdx((i) => (i - 1 + tagItems.length) % tagItems.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyTag((tagItems[tagIdx] ?? tagItems[0]!).tag); }
    else if (e.key === 'Escape') { setTag(null); }
  }

  function addFiles(files: FileList | File[]) {
    const all = Array.from(files).filter((f) => f.size > 0);
    if (all.length === 0) return;
    const cap = uploadLimitBytes(isPremium);
    if (all.some((f) => f.size > cap)) { setUploadError(t('compose.fileTooLarge', { mb: uploadLimitMb(isPremium) })); }
    const ok = all.filter((f) => f.size <= cap);
    setItems((prev) => {
      const room = MAX_CHAT_IMAGES - prev.length;
      if (room <= 0) { setUploadError(t('compose.tooMany', { max: MAX_CHAT_IMAGES })); return prev; }
      const added = ok.slice(0, room).map((file) => {
        const previewUrl = URL.createObjectURL(file);
        blobUrls.current.add(previewUrl);
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          kind: kindOfType(file.type),
          previewUrl,
          file,
          name: file.name,
        } as PendingAttachment;
      });
      return [...prev, ...added];
    });
  }

  // Insert an emoji (unicode glyph or a `:name:` custom shortcode) at the caret.
  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
    const pos = start + emoji.length;
    el.setSelectionRange(pos, pos);
    el.focus();
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    setLen(el.value.length);
  }

  function addGif(url: string) {
    setItems((prev) => {
      if (prev.length >= MAX_CHAT_IMAGES) { setUploadError(t('compose.tooMany', { max: MAX_CHAT_IMAGES })); return prev; }
      return [...prev, { id: `gif-${Date.now()}`, kind: 'image', previewUrl: url, remoteUrl: url }];
    });
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.file) { URL.revokeObjectURL(it.previewUrl); blobUrls.current.delete(it.previewUrl); }
      return prev.filter((x) => x.id !== id);
    });
    setEditingId((cur) => (cur === id ? null : cur));
  }

  function toggleSpoiler(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, spoiler: !it.spoiler } : it)));
  }

  function saveAttachment(id: string, name: string, nsfw: boolean) {
    const clean = name.trim().slice(0, 200);
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, name: clean || it.name, nsfw } : it)));
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (uploading || isPending) return;
    // Expand `:name:` custom-emoji shortcodes (from the picker) into stored
    // `<:name:id>` tokens so they render as images in the published post.
    const content = resolveEmojiShortcodes(textareaRef.current?.value ?? '');
    if (!content.trim() && items.length === 0) return;

    setUploadError(null);

    // Shape a composer item + its resolved URL into a persisted attachment,
    // carrying the optional filename and spoiler flag.
    const toAttachment = (it: PendingAttachment, url: string): PostAttachment => ({
      url,
      kind: it.kind,
      ...(it.name ? { name: it.name } : {}),
      ...(it.spoiler ? { spoiler: true } : {}),
      ...(it.nsfw ? { nsfw: true } : {}),
    });

    // Upload local files (GIFs are already hosted). Preserve composer order.
    let attachments: PostAttachment[] = [];
    const toUpload = items.filter((it) => it.file);
    if (toUpload.length > 0) {
      setUploading(true);
      setUploadProgress(new Map());
      const results = await Promise.all(
        items.map(async (it) => {
          if (it.remoteUrl) return toAttachment(it, it.remoteUrl);
          const res = await uploadDirect(it.file!, {
            bucket: 'posts',
            onProgress: ({ percent }) => {
              setUploadProgress((prev) => new Map(prev).set(it.id, percent));
            },
          });
          if (res.error || !res.url) return null;
          return toAttachment(it, res.url);
        }),
      );
      setUploading(false);
      setUploadProgress(new Map());
      if (results.some((r) => r === null)) { setUploadError(t('compose.uploadFailed')); return; }
      attachments = results.filter(Boolean) as PostAttachment[];
    } else {
      attachments = items.map((it) => toAttachment(it, it.remoteUrl!));
    }

    const fd = new FormData();
    fd.append('content', content);
    fd.append('attachments', JSON.stringify(attachments));
    fd.append('is_nsfw', String(items.some((it) => it.nsfw)));
    startTransition(() => formAction(fd));
  }

  const busy = uploading || isPending;

  return (
    <div className={cn('w-full', isFullscreen && 'flex h-full flex-col')}>
      <form onSubmit={handleSubmit} className={cn(isFullscreen && 'flex min-h-0 flex-1 flex-col')}>
        <div className={cn(
          isFullscreen
            ? 'flex min-h-0 flex-1 flex-col p-4'
            : 'rounded-2xl border border-border/50 bg-card/50 p-4 shadow-sm transition-all duration-200 focus-within:border-link/40 focus-within:bg-card focus-within:shadow-md focus-within:ring-1 focus-within:ring-link/20',
        )}>
        <div className={cn('flex gap-3', isFullscreen && 'min-h-0 flex-1')}>
          {/* Avatar */}
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-foreground/10 ring-1 ring-border/30">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={username} sizes="36px" className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[13px] font-bold text-foreground/50">{initial}</span>
            )}
          </div>

          {/* Input area */}
          <div className={cn('flex min-w-0 flex-1 flex-col', isFullscreen && 'min-h-0')}>
            <textarea
              ref={textareaRef}
              name="content"
              rows={isFullscreen ? 4 : 2}
              maxLength={500}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              autoFocus={isFullscreen}
              placeholder={t('compose.placeholder')}
              className={cn(
                'w-full resize-none bg-transparent pt-1 leading-relaxed text-foreground placeholder:text-muted-foreground/40 outline-none',
                isFullscreen ? 'min-h-[38vh] flex-1 text-[17px]' : 'min-h-[46px] text-[15px]',
              )}
            />

            {/* Hashtag suggestions */}
            {tag && tagItems.length > 0 && (
              <div className="surface-solid mb-2 overflow-hidden rounded-xl border border-border/40 shadow-lg">
                {tagItems.map((it, i) => (
                  <button
                    key={it.tag}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); applyTag(it.tag); }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors',
                      i === tagIdx ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">
                      <Hash className="h-3 w-3 text-link" />{it.tag}
                    </span>
                    <span className="text-[12px] text-muted-foreground/50">{formatCount(it.post_count)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Attachment previews */}
            {items.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {items.map((it) => {
                  const pct = uploadProgress.get(it.id);
                  const isUploading = uploading && it.file && pct !== undefined && pct < 100;
                  const blurMedia = it.spoiler ? 'blur-md scale-110' : '';
                  return (
                    <div key={it.id} className="relative h-20 w-20">
                      <div className="relative h-full w-full overflow-hidden rounded-xl bg-accent ring-1 ring-border/30">
                        {it.kind === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.previewUrl} alt="" className={cn('h-full w-full object-cover transition', blurMedia)} />
                        ) : it.kind === 'video' ? (
                          <>
                            <video src={it.previewUrl} muted className={cn('h-full w-full object-cover transition', blurMedia)} />
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <Play className="h-5 w-5 text-white drop-shadow" />
                            </span>
                          </>
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1.5 text-center">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <span className="w-full truncate text-[9px] text-muted-foreground">{it.name}</span>
                          </div>
                        )}
                        {/* Spoiler badge (when not covered by an upload overlay). */}
                        {it.spoiler && !isUploading && (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <EyeOff className="h-5 w-5 text-white drop-shadow" />
                          </span>
                        )}
                        {/* Age-restricted (18+) badge. */}
                        {it.nsfw && !isUploading && (
                          <span className="pointer-events-none absolute left-1 top-1 rounded bg-destructive px-1 py-0.5 text-[9px] font-bold leading-none text-white">18+</span>
                        )}
                        {/* Progress ring overlay */}
                        {isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                            <div className="relative flex items-center justify-center">
                              <UploadProgressRing percent={pct} size={38} strokeWidth={3} />
                              <span className="absolute text-[10px] font-semibold tabular-nums text-white">
                                {Math.round(pct ?? 0)}
                              </span>
                            </div>
                          </div>
                        )}
                        {/* Indeterminate spinner when uploading but no XHR progress yet */}
                        {uploading && it.file && pct === undefined && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
                            <UploadProgressRing size={38} strokeWidth={3} />
                          </div>
                        )}
                      </div>

                      {/* Action cluster: spoiler toggle, rename, remove. Larger
                          on touch (h-7/28px) than desktop hover (h-5/20px). */}
                      <div className="absolute right-1 top-1 flex items-center gap-1">
                        <Tooltip content={it.spoiler ? t('compose.unmarkSpoiler') : t('compose.markSpoiler')}>
                          <button
                            type="button"
                            onClick={() => toggleSpoiler(it.id)}
                            aria-label={it.spoiler ? t('compose.unmarkSpoiler') : t('compose.markSpoiler')}
                            disabled={uploading}
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-full text-white transition-colors hover:bg-black/80 disabled:opacity-50 md:h-5 md:w-5',
                              it.spoiler ? 'bg-link' : 'bg-black/60',
                            )}
                          >
                            {it.spoiler ? <EyeOff className="h-3.5 w-3.5 md:h-3 md:w-3" /> : <Eye className="h-3.5 w-3.5 md:h-3 md:w-3" />}
                          </button>
                        </Tooltip>
                        {it.file && (
                          <Tooltip content={t('compose.rename')}>
                            <button
                              type="button"
                              onClick={() => setEditingId((cur) => (cur === it.id ? null : it.id))}
                              aria-label={t('compose.rename')}
                              disabled={uploading}
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-full text-white transition-colors hover:bg-black/80 disabled:opacity-50 md:h-5 md:w-5',
                                editingId === it.id ? 'bg-link' : 'bg-black/60',
                              )}
                            >
                              <Pencil className="h-3.5 w-3.5 md:h-3 md:w-3" />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip content={t('compose.removeMedia')}>
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            aria-label={t('compose.removeMedia')}
                            disabled={uploading}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-50 md:h-5 md:w-5"
                          >
                            <X className="h-3.5 w-3.5 md:h-3 md:w-3" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rename editor — in-flow below the grid so it never overflows. */}
            {editingId && (() => {
              const target = items.find((x) => x.id === editingId);
              if (!target) return null;
              return (
                <AttachmentEditor
                  key={target.id}
                  initialName={target.name ?? ''}
                  initialNsfw={!!target.nsfw}
                  filenameLabel={t('compose.filename')}
                  nsfwLabel={ta('markNsfw')}
                  saveLabel={t('actions.save')}
                  cancelLabel={t('actions.cancel')}
                  onSave={(name, nsfw) => saveAttachment(target.id, name, nsfw)}
                  onCancel={() => setEditingId(null)}
                />
              );
            })()}

            {(uploadError || state.error) && (
              <p className="mb-1 text-[12px] text-destructive" role="alert">{uploadError ?? state.error}</p>
            )}

            {/* Toolbar — larger tap targets on touch (h-10/40px), compact on md+ */}
            <div className={cn(
              'flex items-center justify-between border-t border-border/20 pt-2.5',
              isFullscreen && 'sticky bottom-0 bg-background',
            )}>
              <div className="-ml-1.5 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy || items.length >= MAX_CHAT_IMAGES}
                  aria-label={t('compose.attach')}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 md:h-8 md:w-8 md:rounded-lg"
                >
                  <Paperclip className="h-5 w-5 md:h-[17px] md:w-[17px]" />
                </button>
                <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
                <GifPicker onSelect={addGif}>
                  <span className="flex h-10 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground md:h-8 md:rounded-lg md:text-[12px]">
                    <Film className="h-5 w-5 md:h-[17px] md:w-[17px]" />GIF
                  </span>
                </GifPicker>
                <EmojiPicker onSelect={insertEmoji}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground md:h-8 md:w-8 md:rounded-lg">
                    <Smile className="h-5 w-5 md:h-[17px] md:w-[17px]" />
                  </span>
                </EmojiPicker>
              </div>
              <div className="flex items-center gap-3">
                {len > 0 && (
                  <span className={cn('text-[12px] tabular-nums', len > 480 ? 'text-destructive' : 'text-muted-foreground/40')}>
                    {len}/500
                  </span>
                )}
                <Button type="submit" size="sm" isLoading={busy} className="h-10 rounded-full px-6 text-[14px] font-semibold md:h-8 md:px-5 md:text-[13px]">
                  {t('compose.submit')}
                </Button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </form>
    </div>
  );
}
