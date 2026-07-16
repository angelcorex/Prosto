'use client';

import { useEffect, useRef, useState } from 'react';

import { MAX_CHAT_IMAGES, MAX_UPLOAD_BYTES } from '@/lib/utils/media';

export interface PendingFile {
  id: string;
  file: File;
  /** Instant local preview (blob: URL) — shown immediately, no upload yet. */
  previewUrl: string;
  kind: 'image' | 'video' | 'file';
  /** Hide behind a blur until clicked once sent (NSFW / spoiler). */
  spoiler?: boolean;
  /** User-edited display name (pencil rename); falls back to file.name. */
  name?: string;
}

function kindOf(type: string): PendingFile['kind'] {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * Composer attachment queue for chat (images, video, any file — DM + channels).
 *
 * Files are shown instantly as local previews; the actual upload is deferred to
 * send time, so attaching feels instant (Discord-style). Enforces the
 * {@link MAX_CHAT_IMAGES} count cap and {@link MAX_UPLOAD_BYTES} size cap, and
 * flags `warning` ('count' | 'size') briefly when either is exceeded.
 */
export function useChatAttachments(maxBytes: number = MAX_UPLOAD_BYTES) {
  const [items, setItems] = useState<PendingFile[]>([]);
  const [warning, setWarning] = useState<null | 'count' | 'size'>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const createdRef = useRef<Set<string>>(new Set());
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Release every object URL we ever created when the composer unmounts.
  useEffect(() => {
    const created = createdRef.current;
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function flash(w: 'count' | 'size') {
    setWarning(w);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => setWarning(null), 4000);
  }

  function addFiles(files: FileList | File[]) {
    const all = Array.from(files).filter((f) => f.size > 0);
    if (all.length === 0) return;
    if (all.some((f) => f.size > maxBytes)) flash('size');
    const ok = all.filter((f) => f.size <= maxBytes);
    if (ok.length === 0) return;
    const room = MAX_CHAT_IMAGES - itemsRef.current.length;
    if (room <= 0) {
      flash('count');
      return;
    }
    if (ok.length > room) flash('count');
    const added = ok.slice(0, room).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      createdRef.current.add(previewUrl);
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        previewUrl,
        kind: kindOf(file.type),
      } as PendingFile;
    });
    setItems((prev) => [...prev, ...added]);
  }

  function remove(id: string) {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) {
        URL.revokeObjectURL(it.previewUrl);
        createdRef.current.delete(it.previewUrl);
      }
      return prev.filter((x) => x.id !== id);
    });
  }

  function toggleSpoiler(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, spoiler: !it.spoiler } : it)));
  }

  function rename(id: string, name: string) {
    const clean = name.trim().slice(0, 200);
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, name: clean || undefined } : it)));
  }

  /**
   * Take the queued files (and clear the tray) to send them. The caller uses
   * the previews for the optimistic message; the blobs are released on unmount.
   */
  function take(): PendingFile[] {
    const current = itemsRef.current;
    setItems([]);
    setWarning(null);
    return current;
  }

  return { items, count: items.length, warning, addFiles, remove, toggleSpoiler, rename, take };
}
