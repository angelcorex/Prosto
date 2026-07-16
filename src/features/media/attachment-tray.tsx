'use client';

import { useState } from 'react';
import { X, Play, FileText, Eye, EyeOff, Pencil } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { Tooltip } from '@/components/ui';

import type { PendingFile } from './use-chat-attachments';

/**
 * Composer tray showing queued attachments (instant local previews) with a
 * per-item action cluster — spoiler toggle, rename, remove — plus a warning
 * line (count/size). Sits above the input. Files are uploaded on send —
 * progress is shown on the sent message, not here — so this tray only ever
 * shows pre-send previews.
 */
export function AttachmentTray({
  items,
  onRemove,
  onToggleSpoiler,
  onRename,
  warningText,
  removeLabel,
}: {
  items: PendingFile[];
  onRemove: (id: string) => void;
  onToggleSpoiler?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  warningText?: string;
  removeLabel?: string;
}) {
  const t = useT('media');
  const [editingId, setEditingId] = useState<string | null>(null);

  if (items.length === 0 && !warningText) return null;

  return (
    <div className="mb-1 rounded-xl bg-accent/40 p-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => {
            const blurMedia = it.spoiler ? 'blur-md scale-110' : '';
            const label = it.name ?? it.file.name;
            return (
              <div key={it.id} className="relative h-20 w-20">
                <div className="relative h-full w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border/40">
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
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span className="w-full truncate text-[9px] text-muted-foreground">{label}</span>
                    </div>
                  )}
                  {it.spoiler && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <EyeOff className="h-5 w-5 text-white drop-shadow" />
                    </span>
                  )}
                </div>

                {/* Action cluster: spoiler toggle, rename, remove. */}
                <div className="absolute right-1 top-1 flex items-center gap-1">
                  {onToggleSpoiler && (
                    <Tooltip content={it.spoiler ? t('unmarkSpoiler') : t('markSpoiler')}>
                      <button
                        type="button"
                        onClick={() => onToggleSpoiler(it.id)}
                        aria-label={it.spoiler ? t('unmarkSpoiler') : t('markSpoiler')}
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full text-white transition-colors hover:bg-black/80',
                          it.spoiler ? 'bg-link' : 'bg-black/60',
                        )}
                      >
                        {it.spoiler ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </Tooltip>
                  )}
                  {onRename && (
                    <Tooltip content={t('rename')}>
                      <button
                        type="button"
                        onClick={() => setEditingId((cur) => (cur === it.id ? null : it.id))}
                        aria-label={t('rename')}
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full text-white transition-colors hover:bg-black/80',
                          editingId === it.id ? 'bg-link' : 'bg-black/60',
                        )}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip content={removeLabel}>
                    <button
                      type="button"
                      onClick={() => { onRemove(it.id); setEditingId((cur) => (cur === it.id ? null : cur)); }}
                      aria-label={removeLabel}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rename editor — in-flow below the grid so it never overflows. */}
      {onRename && editingId && (() => {
        const target = items.find((x) => x.id === editingId);
        if (!target) return null;
        return (
          <RenameField
            key={target.id}
            initial={target.name ?? target.file.name}
            filenameLabel={t('filename')}
            saveLabel={t('save')}
            cancelLabel={t('cancel')}
            onSave={(name) => { onRename(target.id, name); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        );
      })()}
      {warningText && (
        <p className="mt-1.5 px-0.5 text-[12px] text-destructive">{warningText}</p>
      )}
    </div>
  );
}

/** Inline filename editor popover for a queued attachment. */
function RenameField({
  initial,
  filenameLabel,
  saveLabel,
  cancelLabel,
  onSave,
  onCancel,
}: {
  initial: string;
  filenameLabel: string;
  saveLabel: string;
  cancelLabel: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="surface-solid mt-2 w-full max-w-xs rounded-xl border border-border/40 p-3 shadow-lg">
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">{filenameLabel}</label>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(value); }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        maxLength={200}
        className="w-full rounded-lg border border-border/40 bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-link"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent">
          {cancelLabel}
        </button>
        <button type="button" onClick={() => onSave(value)} className="rounded-lg bg-link px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:opacity-90">
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
