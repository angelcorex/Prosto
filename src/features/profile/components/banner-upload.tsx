'use client';

import { forwardRef, useImperativeHandle, useRef, useState, useTransition } from 'react';
import { ImagePlus, X } from 'lucide-react';
import Image from 'next/image';

import { cn } from '@/lib/utils/cn';
import { frameStyle } from '@/lib/utils/frame';
import { useT } from '@/providers/i18n-provider';
import { ImageCropper, GifFramer, PremiumUpsellModal } from '@/components/ui';
import { uploadBanner } from '../api/actions';
import { UploadMenu, type ImageUploadHandle } from './avatar-upload';

interface BannerUploadProps {
  current?: string | null;
  /** Current framing ("x,y,scale") for an animated GIF banner, if any. */
  currentPos?: string | null;
  onUploaded: (url: string | null, pos?: string | null) => void;
  /** Super Prosto subscriber — unlocks an animated GIF banner (framed, no crop). */
  isPremium?: boolean;
}

const BANNER_ASPECT = 2.5;

export const BannerUpload = forwardRef<ImageUploadHandle, BannerUploadProps>(function BannerUpload(
  { current, currentPos, onUploaded, isPremium },
  ref,
) {
  const t = useT('settings');
  const triggerRef    = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef   = useRef<HTMLInputElement>(null);
  const [preview,   setPreview]   = useState<string | null>(current ?? null);
  const [pos,       setPos]       = useState<string | null>(currentPos ?? null);
  const [error,     setError]     = useState<string | null>(null);
  const [cropSrc,   setCropSrc]   = useState<string | null>(null);
  const [gifFrame,  setGifFrame]  = useState<{ src: string; file: File } | null>(null);
  const [menu,      setMenu]      = useState<{ top: number; left: number } | null>(null);
  const [upsell,    setUpsell]    = useState(false);
  const [isPending, startTransition] = useTransition();

  function openMenu(anchor?: DOMRect) {
    const r = anchor ?? triggerRef.current?.getBoundingClientRect();
    setMenu(r
      ? { top: Math.min(r.bottom + 8, window.innerHeight - 110), left: Math.min(r.left, window.innerWidth - 208) }
      : { top: 80, left: 24 });
  }

  useImperativeHandle(ref, () => ({ open: (anchor?: DOMRect) => openMenu(anchor) }), []);

  function doUpload(file: File, framing?: string | null) {
    setPreview(URL.createObjectURL(file));
    setPos(framing ?? null);
    const fd = new FormData();
    fd.append('banner', file);
    if (framing) fd.append('pos', framing);
    startTransition(async () => {
      const result = await uploadBanner(fd);
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
    if (file.size > 8 * 1024 * 1024) { setError(t('bannerHint')); return; }
    setError(null);
    setCropSrc(URL.createObjectURL(file));
  }

  function pickGif(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'image/gif') { setError(null); setCropSrc(URL.createObjectURL(file)); return; }
    if (file.size > 15 * 1024 * 1024) { setError('GIF · макс. 15 МБ'); return; }
    setError(null);
    setGifFrame({ src: URL.createObjectURL(file), file });
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
    doUpload(new File([blob], 'banner.jpg', { type: 'image/jpeg' }));
  }

  function handleRemove() {
    setPreview(null);
    setPos(null);
    onUploaded(null, null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        {/* Banner clickable area */}
        <div
          ref={triggerRef}
          className={cn(
            'group relative h-24 w-full cursor-pointer overflow-hidden rounded-2xl',
            'bg-secondary',
            isPending && 'opacity-60',
          )}
          onClick={() => (menu ? setMenu(null) : openMenu())}
          role="button"
          tabIndex={0}
          aria-label={t('changeBanner')}
          onKeyDown={(e) => e.key === 'Enter' && openMenu()}
        >
          {preview && (
            <Image
              src={preview}
              alt="banner"
              fill
              sizes="500px"
              className="object-cover"
              style={frameStyle(pos)}
              unoptimized={preview.startsWith('blob:')}
            />
          )}

          {/* Hover overlay */}
          <div className={cn(
            'absolute inset-0 flex items-center justify-center gap-2 bg-black/40 transition-opacity',
            isPending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            <span className="flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
              <ImagePlus className="h-3.5 w-3.5" />
              {isPending ? t('bannerLoading') : t('changeBanner')}
            </span>
            {preview && !isPending && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                className="flex items-center gap-1 rounded-xl bg-white/20 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/30"
              >
                <X className="h-3.5 w-3.5" />
                {t('removeBanner')}
              </button>
            )}
          </div>
        </div>

        {menu && (
          <UploadMenu
            coords={menu}
            onClose={() => setMenu(null)}
            onPhoto={() => { setMenu(null); photoInputRef.current?.click(); }}
            onGif={chooseGif}
            isPremium={isPremium}
            photoLabel={t('uploadPhoto')}
            gifLabel={t('uploadGif')}
          />
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{t('bannerHint')}</p>

      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pickPhoto} />
      <input ref={gifInputRef} type="file" accept="image/gif" className="sr-only" onChange={pickGif} />

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          shape="rect"
          aspect={BANNER_ASPECT}
          outputWidth={1000}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onApply={applyCrop}
        />
      )}

      {gifFrame && (
        <GifFramer
          src={gifFrame.src}
          shape="rect"
          aspect={BANNER_ASPECT}
          onCancel={() => { URL.revokeObjectURL(gifFrame.src); setGifFrame(null); }}
          onApply={applyGifFrame}
        />
      )}

      <PremiumUpsellModal open={upsell} onClose={() => setUpsell(false)} />
    </div>
  );
});
