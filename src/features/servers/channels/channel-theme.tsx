'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Loader2, Trash2, X, Hash } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { Button, Label } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { uploadChannelTheme, setChannelTheme } from '../actions';

export interface ChannelTheme { image: string | null; dim: number; x: number; y: number }

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex justify-end">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-card shadow-2xl animate-slide-in-right">
        <div className="flex shrink-0 items-center justify-between border-b border-border/30 px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A mini chat mock that shows how the wallpaper looks at a given size/dim. */
function DevicePreview({ image, dim, scale, phone, label }: { image: string | null; dim: number; scale: number; phone?: boolean; label: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <div className={cn('relative overflow-hidden rounded-xl bg-secondary ring-1 ring-border/50', phone ? 'h-[220px] w-[124px]' : 'aspect-video w-full')}>
        {image && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ transform: `scale(${scale / 100})`, transformOrigin: 'center' }} />
            <div className="absolute inset-0 bg-background" style={{ opacity: dim }} />
          </>
        )}
        {/* Mock header */}
        <div className="relative flex items-center gap-1 border-b border-white/10 bg-black/20 px-2 py-1 text-[9px] font-semibold text-white/80 backdrop-blur-sm">
          <Hash className="h-2.5 w-2.5" /> general
        </div>
        {/* Mock messages */}
        <div className={cn('relative flex flex-col p-2', phone ? 'gap-1.5' : 'gap-2.5')}>
          {(phone ? [2 / 3, 1 / 2, 3 / 5] : [2 / 3, 1 / 2, 3 / 4, 2 / 5, 7 / 12]).map((w, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className={cn('shrink-0 rounded-full', phone ? 'h-4 w-4' : 'h-5 w-5', i % 3 === 0 ? 'bg-link/40' : i % 3 === 1 ? 'bg-success/40' : 'bg-warning/40')} />
              <span className={cn('rounded-md bg-white/25', phone ? 'h-3' : 'h-3.5')} style={{ width: `${Math.round(w * 100)}%` }} />
            </div>
          ))}
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

interface Props {
  serverId: string;
  channelId: string;
  initial: ChannelTheme;
  onClose: () => void;
  onApplied: (theme: ChannelTheme) => void;
}

/** Channel wallpaper editor: image + dim + size, with device previews. */
export function ChannelThemeEditor({ serverId, channelId, initial, onClose, onApplied }: Props) {
  const t = useT('servers');
  const fileRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<string | null>(initial.image);
  const [dim, setDim] = useState(initial.dim ?? 0.4);
  const [scale, setScale] = useState(Math.max(100, initial.x ?? 100));
  const [all, setAll] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.type === 'image/gif') { setError(t('themeNoGif')); return; }
    if (file.size > 15 * 1024 * 1024) { setError(t('themeTooLarge')); return; }
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadChannelTheme(serverId, fd);
    setUploading(false);
    if ('url' in res && res.url) { setImage(res.url); setScale(100); }
    else setError(t('themeTooLarge'));
  }

  async function save() {
    setSaving(true);
    const res = await setChannelTheme(channelId, { image, dim, x: scale, y: 0, all });
    setSaving(false);
    if (!('error' in res)) {
      if (!all) onApplied({ image, dim, x: scale, y: 0 });
      window.dispatchEvent(new CustomEvent('server:changed'));
      window.dispatchEvent(new CustomEvent('prosto:channel-reload'));
      onClose();
    } else {
      setError(String(res.error));
    }
  }

  async function remove() {
    setSaving(true);
    const res = await setChannelTheme(channelId, { image: null, dim, x: scale, y: 0, all });
    setSaving(false);
    if (!('error' in res)) {
      if (!all) onApplied({ image: null, dim, x: scale, y: 0 });
      window.dispatchEvent(new CustomEvent('server:changed'));
      window.dispatchEvent(new CustomEvent('prosto:channel-reload'));
      onClose();
    }
  }

  return (
    <Drawer title={t('channelTheme')} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {!image ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-secondary text-muted-foreground ring-1 ring-border/50 transition-colors hover:text-foreground"
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-7 w-7" />}
            <span className="text-[13px]">{t('themeUpload')}</span>
          </button>
        ) : (
          <>
            {/* Device previews */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{t('themePreview')}</p>
              <div className="flex flex-col items-center gap-4">
                <DevicePreview image={image} dim={dim} scale={scale} label={t('themeDesktop')} />
                <DevicePreview image={image} dim={dim} scale={scale} phone label={t('themeMobile')} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} className="text-[13px] font-medium text-link hover:underline">{uploading ? t('themeUploading') : t('themeReplace')}</button>
              <button type="button" onClick={() => setImage(null)} className="text-[13px] text-muted-foreground hover:text-destructive">{t('removeImage')}</button>
            </div>

            {/* Size */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>{t('themeSize')}</Label>
                <span className="text-[12px] tabular-nums text-muted-foreground">{scale}%</span>
              </div>
              <input type="range" min={100} max={250} step={5} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full accent-link" />
            </div>

            {/* Dim */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>{t('themeDim')}</Label>
                <span className="text-[12px] tabular-nums text-muted-foreground">{Math.round(dim * 100)}%</span>
              </div>
              <input type="range" min={0} max={0.9} step={0.05} value={dim} onChange={(e) => setDim(Number(e.target.value))} className="w-full accent-link" />
            </div>
          </>
        )}

        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        {/* Target */}
        <div className="flex rounded-lg bg-secondary/60 p-0.5 text-[13px] font-medium">
          <button type="button" onClick={() => setAll(false)} className={cn('flex-1 rounded-md px-3 py-1.5 transition-colors', !all ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{t('themeThisChannel')}</button>
          <button type="button" onClick={() => setAll(true)} className={cn('flex-1 rounded-md px-3 py-1.5 transition-colors', all ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{t('themeAllChannels')}</button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={remove} disabled={saving} className="text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> {t('themeReset')}
          </Button>
          <Button size="sm" onClick={save} isLoading={saving}>{t('save')}</Button>
        </div>
      </div>
    </Drawer>
  );
}
