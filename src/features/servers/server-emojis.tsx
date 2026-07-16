'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, ImagePlus, Pencil } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { Input } from '@/components/ui';
import { uploadServerEmoji, deleteServerEmoji, renameServerEmoji } from './actions';
import { setCachedServerEmojis } from '@/lib/emoji';

interface Emoji { id: string; public_id: string; name: string; url: string; is_animated: boolean }

const MAX_STATIC = 100;
const MAX_ANIMATED = 50;
const MAX_BYTES = 512 * 1024;

export function ServerEmojis({ serverId }: { serverId: string }) {
  const t = useT('servers');
  const sbRef = useRef(createClient());
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sbRef.current as any).rpc('list_server_emojis', { p_server: serverId });
    const list: Emoji[] = Array.isArray(data) ? data : [];
    setEmojis(list);
    // Keep the shared picker cache in sync so new/renamed/removed emojis show
    // up everywhere (DMs, feed) without opening this tab again.
    setCachedServerEmojis(serverId, list);
    setLoading(false);
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  const staticEmojis = emojis.filter((e) => !e.is_animated);
  const animatedEmojis = emojis.filter((e) => e.is_animated);

  async function onFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setError(null);
    setBusy(true);
    let staticLeft = MAX_STATIC - staticEmojis.length;
    let animLeft = MAX_ANIMATED - animatedEmojis.length;
    let lastErr: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (file.size > MAX_BYTES) { lastErr = t('emojiTooLarge'); continue; }
      const animated = file.type === 'image/gif';
      if (animated) { if (animLeft <= 0) { lastErr = t('emojiLimitAnimated'); continue; } }
      else { if (staticLeft <= 0) { lastErr = t('emojiLimitStatic'); continue; } }

      // Single upload can use the name field; batches derive names per file.
      const base = files.length === 1 && name.trim() ? name.trim() : file.name.replace(/\.[^.]+$/, '');
      const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
      if (clean.length < 2) { lastErr = t('emojiBadName'); continue; }

      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadServerEmoji(serverId, clean, fd);
      if ('error' in res && res.error) { lastErr = mapError(res.error); continue; }
      if (animated) animLeft--; else staticLeft--;
    }

    setBusy(false);
    setName('');
    setError(lastErr);
    await load();
  }

  function mapError(e: string): string {
    if (e.includes('animated limit')) return t('emojiLimitAnimated');
    if (e.includes('emoji limit')) return t('emojiLimitStatic');
    if (e.includes('invalid name')) return t('emojiBadName');
    if (e.includes('too large')) return t('emojiTooLarge');
    if (e.includes('duplicate') || e.includes('unique')) return t('emojiDuplicate');
    return e;
  }

  // Emojis are addressed by their short snowflake public_id (like users/servers),
  // which is what the rename/delete RPCs now expect.
  async function remove(publicId: string) {
    const next = emojis.filter((e) => e.public_id !== publicId);
    setEmojis(next);
    setCachedServerEmojis(serverId, next);
    await deleteServerEmoji(publicId);
  }

  async function rename(publicId: string, nextName: string): Promise<string | null> {
    const clean = nextName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 2) return t('emojiBadName');
    const cur = emojis.find((e) => e.public_id === publicId);
    if (cur && clean === cur.name) return null; // no change
    if (emojis.some((e) => e.public_id !== publicId && e.name === clean)) return t('emojiDuplicate');
    const next = emojis.map((e) => (e.public_id === publicId ? { ...e, name: clean } : e));
    setEmojis(next);
    setCachedServerEmojis(serverId, next);
    const res = await renameServerEmoji(publicId, clean);
    if ('error' in res && res.error) { await load(); return mapError(res.error); }
    return null;
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{t('tabEmoji')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('emojiHint')}</p>

      {/* Upload — drag & drop several images, or click to browse */}
      <div className="mb-3 flex flex-col gap-3">
        <div className="max-w-xs">
          <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t('emojiName')}</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder={t('emojiNamePlaceholder')}
            maxLength={32}
          />
          <p className="mt-1 text-[11px] text-muted-foreground/50">{t('emojiNameOptional')}</p>
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
          className={cn(
            'flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
            dragOver ? 'border-link bg-link/10' : 'border-border/50 bg-secondary/30 hover:bg-secondary/50',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
          <span className="text-[14px] font-medium text-foreground">{busy ? t('emojiUploading') : t('emojiDropzone')}</span>
          <span className="text-[12px] text-muted-foreground/60">{t('emojiDropzoneHint')}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="sr-only"
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        />
      </div>
      {error && <p className="mb-6 text-[13px] text-destructive">{error}</p>}
      {!error && <div className="mb-6" />}

      {loading ? (
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 w-14 animate-skeleton rounded-xl" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <EmojiSection title={t('emojiStatic')} count={staticEmojis.length} max={MAX_STATIC} items={staticEmojis} onRemove={remove} onRename={rename} empty={t('emojiEmpty')} />
          <EmojiSection title={t('emojiAnimated')} count={animatedEmojis.length} max={MAX_ANIMATED} items={animatedEmojis} onRemove={remove} onRename={rename} empty={t('emojiEmpty')} />
        </div>
      )}
    </div>
  );
}

function EmojiSection({ title, count, max, items, onRemove, onRename, empty }: {
  title: string; count: number; max: number; items: Emoji[];
  onRemove: (id: string) => void; onRename: (id: string, name: string) => Promise<string | null>; empty: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold">{title}</h2>
        <span className={cn('text-[13px] tabular-nums', count >= max ? 'text-destructive' : 'text-muted-foreground')}>{count} / {max}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {items.map((e) => (
            <EmojiTile key={e.id} emoji={e} onRemove={onRemove} onRename={onRename} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmojiTile({ emoji, onRemove, onRename }: {
  emoji: Emoji; onRemove: (id: string) => void; onRename: (id: string, name: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emoji.name);
  const [err, setErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function start() { setDraft(emoji.name); setErr(false); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }

  async function commit() {
    setSaving(true);
    const error = await onRename(emoji.public_id, draft);
    setSaving(false);
    if (error) { setErr(true); return; }
    setEditing(false);
  }

  return (
    <div className="group relative flex w-[64px] flex-col items-center gap-1">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-secondary/50 ring-1 ring-border/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={emoji.url} alt={emoji.name} className="max-h-full max-w-full object-contain" />
      </div>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(ev) => { setErr(false); setDraft(ev.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); }}
          onKeyDown={(ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') setEditing(false); }}
          onBlur={commit}
          maxLength={32}
          disabled={saving}
          className={cn(
            'w-[64px] rounded bg-background px-1 py-0.5 text-center text-[10px] outline-none ring-1',
            err ? 'ring-destructive' : 'ring-border/60 focus:ring-link/60',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={start}
          title={emoji.name}
          className="flex max-w-[64px] items-center gap-0.5 truncate text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <span className="truncate">:{emoji.name}:</span>
          <Pencil className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
        </button>
      )}

      <button
        type="button"
        onClick={() => onRemove(emoji.public_id)}
        aria-label="delete"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white opacity-0 shadow transition-opacity hover:bg-destructive/90 group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
