'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { X, Camera, Users } from 'lucide-react';

import { cn }           from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT }         from '@/providers/i18n-provider';
import { ImageCropper } from '@/components/ui';
import { uploadGroupAvatar } from '../api/actions';

interface EditGroupModalProps {
  conversationId: string;
  currentName: string | null;
  currentAvatar: string | null;
  onClose: () => void;
}

export function EditGroupModal({ conversationId, currentName, currentAvatar, onClose }: EditGroupModalProps) {
  const t = useT('messages');
  const router = useRouter();
  const sbRef = useRef(createClient());
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName ?? '');
  const [avatar, setAvatar] = useState<string | null>(currentAvatar);
  const [preview, setPreview] = useState<string | null>(currentAvatar);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handlePickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || file.size > 5 * 1024 * 1024) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = '';
  }

  function applyCrop(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setPreview(URL.createObjectURL(blob));
    setUploading(true);
    const fd = new FormData();
    fd.append('avatar', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    uploadGroupAvatar(fd).then(res => {
      if (res.url) setAvatar(res.url);
      setUploading(false);
    });
  }

  async function handleSave() {
    if (saving || uploading) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).rpc('update_group', {
      conv: conversationId,
      gname: name.trim() || null,
      gavatar: avatar !== currentAvatar ? avatar : null,
    });
    window.dispatchEvent(new CustomEvent('prosto:conv-updated', { detail: { conversationId } }));
    onClose();
    router.refresh();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-border/50 bg-card shadow-xl">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold">{t('editGroup')}</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 px-4 pb-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'group relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border/50 transition-all hover:ring-link/50',
              uploading && 'opacity-60',
            )}
          >
            {preview
              ? <Image src={preview} alt="" fill sizes="80px" className="object-cover" unoptimized={preview.startsWith('blob:')} />
              : <span className="flex h-full w-full items-center justify-center text-link"><Users className="h-8 w-8" /></span>}
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="sr-only"
            onChange={handlePickAvatar}
          />
          {cropSrc && (
            <ImageCropper
              src={cropSrc}
              shape="circle"
              outputWidth={512}
              onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
              onApply={applyCrop}
            />
          )}
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('groupNameOptional')}
            maxLength={60}
            className="w-full rounded-lg bg-secondary/50 px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none ring-1 ring-transparent focus:ring-link/50"
          />
        </div>

        <div className="border-t border-border/30 px-4 py-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="w-full rounded-lg bg-link py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? t('creating') : t('saveGroup')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
