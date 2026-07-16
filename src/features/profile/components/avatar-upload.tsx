'use client';

import { forwardRef, useImperativeHandle, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, Film, Sparkles } from 'lucide-react';
import Image from 'next/image';

import { cn } from '@/lib/utils/cn';
import { frameStyle } from '@/lib/utils/frame';
import { useT } from '@/providers/i18n-provider';
import { ImageCropper, GifFramer, PremiumUpsellModal } from '@/components/ui';
import { uploadAvatar } from '../api/actions';

export interface ImageUploadHandle {
  /** Open the Photo/GIF chooser. Pass a rect to anchor the menu to it
   *  (e.g. the profile-preview avatar); omit to anchor to this component. */
  open: (anchor?: DOMRect) => void;
}

interface AvatarUploadProps {
  current?: string | null;
  /** Current framing ("x,y,scale") for an animated GIF avatar, if any. */
  currentPos?: string | null;
  initial: string;       // single uppercase letter fallback
  onUploaded: (url: string, pos?: string | null) => void;
  size?: 'md' | 'lg';
  /** Super Prosto subscriber — unlocks an animated GIF avatar (framed, no crop). */
  isPremium?: boolean;
}

export const AvatarUpload = forwardRef<ImageUploadHandle, AvatarUploadProps>(function AvatarUpload(
  { current, currentPos, initial, onUploaded, size = 'md', isPremium },
  ref,
) {
  const t = useT('settings');
  const triggerRef    = useRef<HTMLButtonElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef   = useRef<HTMLInputElement>(null);
  const [preview, setPreview]   = useState<string | null>(current ?? null);
  const [pos, setPos]           = useState<string | null>(currentPos ?? null);
  const [error,   setError]     = useState<string | null>(null);
  const [cropSrc, setCropSrc]   = useState<string | null>(null);
  const [gifFrame, setGifFrame] = useState<{ src: string; file: File } | null>(null);
  const [menu, setMenu]         = useState<{ top: number; left: number } | null>(null);
  const [upsell, setUpsell]     = useState(false);
  const [isPending, startTransition] = useTransition();

  function openMenu(anchor?: DOMRect) {
    const r = anchor ?? triggerRef.current?.getBoundingClientRect();
    setMenu(r
      ? { top: Math.min(r.bottom + 8, window.innerHeight - 110), left: Math.min(r.left, window.innerWidth - 208) }
      : { top: 80, left: 24 });
  }

  useImperativeHandle(ref, () => ({ open: (anchor?: DOMRect) => openMenu(anchor) }), []);

  const dim = size === 'lg' ? 'h-[72px] w-[72px]' : 'h-14 w-14';

  function doUpload(file: File, framing?: string | null) {
    setPreview(URL.createObjectURL(file));
    setPos(framing ?? null);
    const fd = new FormData();
    fd.append('avatar', file);
    if (framing) fd.append('pos', framing);
    startTransition(async () => {
      const result = await uploadAvatar(fd);
      if (result.error) {
        setError(result.error === 'premium_required' ? t('gifPremiumOnly') : result.error);
        setPreview(current ?? null);
        setPos(currentPos ?? null);
      } else if (result.url) {
        onUploaded(result.url, framing ?? null);
        setPreview(result.url);
      }
    });
  }

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError(t('avatarHint')); return; }
    setError(null);
    setCropSrc(URL.createObjectURL(file));   // → cropper → static upload (clears framing)
  }

  function pickGif(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Not actually a GIF? Route it through the cropper like a normal photo.
    if (file.type !== 'image/gif') { setError(null); setCropSrc(URL.createObjectURL(file)); return; }
    if (file.size > 15 * 1024 * 1024) { setError('GIF · макс. 15 МБ'); return; }
    setError(null);
    setGifFrame({ src: URL.createObjectURL(file), file });   // → framer → upload with position
  }

  function applyGifFrame(framing: string) {
    const gf = gifFrame;
    if (!gf) return;
    setGifFrame(null);
    doUpload(gf.file, framing);
    URL.revokeObjectURL(gf.src);
  }

  function chooseGif() {
    setMenu(null);
    if (isPremium) gifInputRef.current?.click();
    else setUpsell(true);
  }

  function applyCrop(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    doUpload(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));   // static → framing cleared
  }

  return (
    <div className="flex items-center gap-4">
      {/* Clickable avatar circle + chooser menu */}
      <div className="shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (menu ? setMenu(null) : openMenu())}
          disabled={isPending}
          aria-label={t('changeAvatar')}
          className={cn(
            'group relative overflow-hidden rounded-full bg-link/20',
            'ring-2 ring-border/50 transition-all hover:ring-link/50',
            dim,
            isPending && 'opacity-60',
          )}
        >
          {preview ? (
            <Image
              src={preview}
              alt="avatar"
              fill
              sizes="96px"
              className="object-cover"
              style={frameStyle(pos)}
              unoptimized={preview.startsWith('blob:')}
            />
          ) : (
            <span className={cn(
              'flex h-full w-full items-center justify-center font-bold text-link',
              size === 'lg' ? 'text-3xl' : 'text-2xl',
            )}>
              {initial}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </span>
        </button>

        {menu && <UploadMenu coords={menu} onClose={() => setMenu(null)} onPhoto={() => { setMenu(null); photoInputRef.current?.click(); }} onGif={chooseGif} isPremium={isPremium} photoLabel={t('uploadPhoto')} gifLabel={t('uploadGif')} />}
      </div>

      {/* Text actions */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => openMenu()}
          disabled={isPending}
          className="w-fit text-sm font-medium text-link hover:underline disabled:opacity-50"
        >
          {isPending ? t('saving') : t('changeAvatar')}
        </button>
        <p className="text-xs text-muted-foreground">{t('avatarHint')}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pickPhoto} />
      <input ref={gifInputRef} type="file" accept="image/gif" className="sr-only" onChange={pickGif} />

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          shape="circle"
          outputWidth={512}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onApply={applyCrop}
        />
      )}

      {gifFrame && (
        <GifFramer
          src={gifFrame.src}
          shape="circle"
          onCancel={() => { URL.revokeObjectURL(gifFrame.src); setGifFrame(null); }}
          onApply={applyGifFrame}
        />
      )}

      <PremiumUpsellModal open={upsell} onClose={() => setUpsell(false)} />
    </div>
  );
});

/** Small "Upload photo / Upload GIF" chooser (Discord-style), portalled to the
 *  body with a fixed position so it floats above the form (no clipping). */
export function UploadMenu({
  coords, onClose, onPhoto, onGif, isPremium, photoLabel, gifLabel,
}: {
  coords: { top: number; left: number };
  onClose: () => void;
  onPhoto: () => void;
  onGif: () => void;
  isPremium?: boolean;
  photoLabel: string;
  gifLabel: string;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="surface-solid fixed z-[9999] w-48 overflow-hidden rounded-2xl p-1.5 shadow-2xl ring-1 ring-border/50 animate-pop-in"
        style={{ top: coords.top, left: coords.left }}
      >
        <button
          type="button"
          onClick={onPhoto}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-accent"
        >
          <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
          {photoLabel}
        </button>
        <button
          type="button"
          onClick={onGif}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors hover:bg-accent"
        >
          <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
          {gifLabel}
          {!isPremium && <Sparkles className="ml-auto h-3.5 w-3.5 shrink-0 text-[#b3a8ff]" />}
        </button>
      </div>
    </>,
    document.body,
  );
}
