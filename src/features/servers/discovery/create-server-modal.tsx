'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { X, Camera, Plus } from 'lucide-react';

import { Button, Input, Label } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { createServer, uploadServerImage } from '../actions';

export function CreateServerModal({ onClose }: { onClose: () => void }) {
  const t = useT('servers');
  const router = useRouter();
  const [name, setName] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickIcon(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
    e.target.value = '';
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = await createServer(trimmed);
    if (!('publicId' in res) || !res.publicId) { setBusy(false); return; }
    if (iconFile && res.id) {
      const fd = new FormData();
      fd.append('file', iconFile);
      await uploadServerImage(res.id, 'icon', fd);
    }
    window.dispatchEvent(new CustomEvent('servers:changed'));
    router.push(site.routes.server(res.publicId));
    onClose();
  }

  const initial = name.trim()[0]?.toUpperCase() ?? '';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-3xl bg-card p-7 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-2xl font-bold tracking-tight">{t('createTitle')}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{t('createSubtitle')}</p>

        {/* Icon upload */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex h-[88px] w-[88px] items-center justify-center rounded-full"
          >
            {iconPreview ? (
              <Image src={iconPreview} alt="" width={88} height={88} className="h-full w-full rounded-full object-cover" unoptimized />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground">
                {initial ? <span className="text-2xl font-bold text-foreground/70">{initial}</span> : <Camera className="h-5 w-5" />}
                <span className="text-[10px] font-bold uppercase tracking-wider">{t('upload')}</span>
              </span>
            )}
            <span className="absolute -right-0.5 -top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-link text-white ring-2 ring-card">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={pickIcon} />
        </div>

        {/* Name */}
        <div className="mt-6 flex flex-col gap-1.5 text-left">
          <Label htmlFor="server-name">{t('name')}</Label>
          <Input
            id="server-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={t('namePlaceholder')}
            maxLength={60}
          />
        </div>

        <div className="mt-7 flex items-center justify-between">
          <button type="button" onClick={onClose} disabled={busy} className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
            {t('cancel')}
          </button>
          <Button size="md" onClick={submit} isLoading={busy} disabled={!name.trim()} className="px-7">{t('create')}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
