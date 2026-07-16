'use client';

import { useRef, useState, useTransition } from 'react';
import { Camera } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { ImageCropper } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { uploadBotAvatar } from '../api/actions';
import { errorMessage } from './errors';

/**
 * Bot avatar picker — same UX as the user avatar (click → file → crop → upload),
 * not a URL field. Uploads via the owner-guarded uploadBotAvatar action to the
 * avatars bucket. Static images only.
 */
export function BotAvatarUpload({
  botId, current, initial, onUploaded,
}: {
  botId: string;
  current: string | null;
  initial: string;
  onUploaded: (url: string) => void;
}) {
  const t = useT('developers');
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError(t('avatarTooLarge')); return; }
    setError(null);
    setCropSrc(URL.createObjectURL(file));
  }

  function applyCrop(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
    setPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.append('avatar', file);
    startTransition(async () => {
      const res = await uploadBotAvatar(botId, fd);
      if (!res.ok) { setError(errorMessage(t, res.error)); setPreview(current); return; }
      setPreview(res.data.url);
      onUploaded(res.data.url);
    });
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        aria-label={t('changeBotAvatar')}
        className={cn(
          'group relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-primary/10',
          'ring-2 ring-border transition-all hover:ring-primary/50',
          pending && 'opacity-60',
        )}
      >
        {preview ? (
          // Plain <img> (not next/image fill) so the preview is physically
          // locked to the 80px button and can never escape to full-screen; also
          // avoids needing a remotePattern for the storage host.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-primary">{initial}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-5 w-5 text-white" />
        </span>
      </button>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="w-fit text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          {pending ? t('uploading') : t('changeBotAvatar')}
        </button>
        <p className="text-xs text-muted-foreground">{t('avatarUploadHint')}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} />

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          shape="circle"
          outputWidth={512}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onApply={applyCrop}
        />
      )}
    </div>
  );
}
