'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { X, Search, Check, Camera } from 'lucide-react';

import { cn }           from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT }         from '@/providers/i18n-provider';
import { ImageCropper, renderEmojiNodes } from '@/components/ui';
import { uploadGroupAvatar } from '../api/actions';

interface Friend {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface CreateGroupModalProps {
  /** Pre-selected member ids (e.g. when opened from a user's menu). */
  preselect?: string[];
  /** When set, adds the selected members to this existing group instead of creating one. */
  addToGroup?: string;
  onClose: () => void;
}

export function CreateGroupModal({ preselect = [], addToGroup, onClose }: CreateGroupModalProps) {
  const t = useT('messages');
  const router = useRouter();
  const sbRef = useRef(createClient());
  const fileRef = useRef<HTMLInputElement>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(preselect));
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const sb = sbRef.current;
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const myId = user.id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows } = await (sb as any)
        .from('friend_requests')
        .select(`from_id, to_id, status,
          from:profiles!friend_requests_from_id_fkey(username, display_name, avatar_url),
          to:profiles!friend_requests_to_id_fkey(username, display_name, avatar_url)`)
        .eq('status', 'accepted')
        .or(`from_id.eq.${myId},to_id.eq.${myId}`);
      if (!active) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: Friend[] = (rows ?? []).map((r: any) => {
        const isFrom = r.from_id === myId;
        const id = isFrom ? r.to_id : r.from_id;
        const p  = isFrom ? r.to : r.from;
        const prof = Array.isArray(p) ? p[0] : p;
        return { id, username: prof?.username ?? '', display_name: prof?.display_name ?? null, avatar_url: prof?.avatar_url ?? null };
      });
      setFriends(list);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(f =>
      f.username.toLowerCase().includes(q) || (f.display_name ?? '').toLowerCase().includes(q));
  }, [friends, query]);

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function handlePickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = '';
  }

  function applyCrop(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setAvatarPreview(URL.createObjectURL(blob));
    setUploading(true);
    const fd = new FormData();
    fd.append('avatar', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    uploadGroupAvatar(fd).then(res => {
      if (res.url) setAvatar(res.url);
      setUploading(false);
    });
  }

  async function handleCreate() {
    if (selected.size < 1 || creating) return;
    setCreating(true);

    if (addToGroup) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sbRef.current as any).rpc('add_group_members', {
        conv: addToGroup,
        member_ids: Array.from(selected),
      });
      if (!error) {
        window.dispatchEvent(new CustomEvent('prosto:conv-updated', { detail: { conversationId: addToGroup } }));
        onClose();
        router.refresh();
      } else {
        setCreating(false);
      }
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sbRef.current as any).rpc('create_group', {
      member_ids: Array.from(selected),
      gname: name.trim() || null,
      gavatar: avatar,
    });
    if (!error && data) {
      onClose();
      router.push(`/messages/${data}`);
      router.refresh();
    } else {
      setCreating(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[78vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-[15px] font-semibold">{addToGroup ? t('inviteToGroup') : t('createGroup')}</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('searchFriends')}
              className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>
        </div>

        {/* Friend list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted-foreground/60">{t('noFriendsToAdd')}</p>
          )}
          {filtered.map(f => {
            const fname = f.display_name ?? f.username;
            const initial = fname[0]?.toUpperCase() ?? '?';
            const checked = selected.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
              >
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-link/20">
                  {f.avatar_url
                    ? <AvatarImage src={f.avatar_url} alt={fname} sizes="32px" className="object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{initial}</span>}
                </div>
                <span className="min-w-0 flex-1 truncate text-[14px]">{renderEmojiNodes(fname)}</span>
                <span className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                  checked ? 'border-link bg-link text-white' : 'border-muted-foreground/30',
                )}>
                  {checked && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border/30 px-4 py-3">
          {!addToGroup && (
            <div className="mb-2.5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'group relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border/50 transition-all hover:ring-link/50',
                  uploading && 'opacity-60',
                )}
                aria-label={t('groupAvatar')}
              >
                {avatarPreview ? (
                  <Image src={avatarPreview} alt="" fill sizes="40px" className="object-cover" unoptimized={avatarPreview.startsWith('blob:')} />
                ) : null}
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white/90 transition-colors group-hover:bg-black/50">
                  <Camera className="h-4 w-4" />
                </span>
              </button>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('groupNameOptional')}
                maxLength={60}
                className="w-full rounded-lg bg-secondary/50 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none ring-1 ring-transparent focus:ring-link/50"
              />
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
            </div>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={selected.size < 1 || creating || uploading}
            className="w-full rounded-lg bg-link py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {creating ? t('creating') : addToGroup ? t('inviteToGroup') : t('createGroupBtn')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
