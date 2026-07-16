'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Hash, Folder, AlertTriangle, Settings, Shield } from 'lucide-react';

import { Button, Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { createChannel, createCategory, createServerInvite, deleteChannel, deleteCategory, renameChannel, renameCategory } from '../actions';
import { PermissionOverrideEditor } from '../roles/permission-override-editor';

/** Small centered modal used by CreateChannel/CreateCategory/ServerInvite. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function CreateChannelModal({ serverId, categoryId, onClose }: { serverId: string; categoryId?: string | null; onClose: () => void }) {
  const t = useT('servers');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const res = await createChannel(serverId, name.trim(), categoryId ?? null);
    if (!('error' in res)) { window.dispatchEvent(new CustomEvent('server:changed')); onClose(); return; }
    setBusy(false);
  }
  return (
    <Modal title={t('createChannel')} onClose={onClose}>
      <div className="mt-5 flex flex-col gap-1.5">
        <Label htmlFor="ch-name">{t('channelName')}</Label>
        <div className="relative">
          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="ch-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={t('channelName')} maxLength={20} className="pl-9" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
        <Button size="md" onClick={submit} isLoading={busy} disabled={!name.trim()}>{t('create')}</Button>
      </div>
    </Modal>
  );
}

export function CreateCategoryModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const t = useT('servers');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const res = await createCategory(serverId, name.trim());
    if (!('error' in res)) { window.dispatchEvent(new CustomEvent('server:changed')); onClose(); return; }
    setBusy(false);
  }
  return (
    <Modal title={t('createCategory')} onClose={onClose}>
      <div className="mt-5 flex flex-col gap-1.5">
        <Label htmlFor="cat-name">{t('categoryName')}</Label>
        <div className="relative">
          <Folder className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="cat-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={t('categoryName')} maxLength={20} className="pl-9" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
        <Button size="md" onClick={submit} isLoading={busy} disabled={!name.trim()}>{t('create')}</Button>
      </div>
    </Modal>
  );
}

export interface ManageTargetSpec {
  kind: 'channel' | 'category';
  id: string;
  name: string;
  serverId: string;
  /** Only relevant for channels — enables the "Sync with category" flow. */
  categoryId?: string | null;
  /** Only relevant for channels. */
  syncedToCategory?: boolean;
}

/**
 * Full-screen channel/category settings — same shell as ServerSettings so it
 * feels consistent across the app. Left nav switches between Overview (rename
 * + delete) and Permissions (role overrides). Escape closes.
 */
export function ManageTarget({ target, onClose }: { target: ManageTargetSpec; onClose: () => void }) {
  const t = useT('servers');
  const isChannel = target.kind === 'channel';
  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[55] flex justify-center bg-background">
      <div className="flex h-full w-full max-w-[1160px]">
        {/* Left navigation — mirrors ServerSettings for visual parity. */}
        <nav className="settings-nav flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto py-14 pl-6 pr-4">
          <p className="truncate px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">
            {isChannel ? `#${target.name}` : target.name}
          </p>
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<Settings className="h-4 w-4" />}>
            {t('tabOverview')}
          </TabButton>
          <TabButton active={tab === 'permissions'} onClick={() => setTab('permissions')} icon={<Shield className="h-4 w-4" />}>
            {t('tabPermissions')}
          </TabButton>
        </nav>

        {/* Centered content column. */}
        <div className="relative flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-[840px] px-10 py-14">
            <h1 className="mb-2 text-2xl font-bold tracking-tight">
              {isChannel ? t('editChannel') : t('editCategory')}
            </h1>
            <p className="mb-8 truncate text-[13px] text-muted-foreground">
              {isChannel ? `#${target.name}` : target.name}
            </p>

            {tab === 'overview' ? (
              <OverviewTab target={target} onClose={onClose} />
            ) : (
              <PermissionOverrideEditor
                kind={target.kind}
                targetId={target.id}
                serverId={target.serverId}
                initialSynced={target.syncedToCategory ?? true}
                hasCategory={isChannel && !!target.categoryId}
              />
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="fixed right-6 top-6 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={t('cancel')}
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] font-medium transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-foreground' : 'text-muted-foreground/60')}>{icon}</span>
      {children}
    </button>
  );
}

function OverviewTab({ target, onClose }: { target: ManageTargetSpec; onClose: () => void }) {
  const t = useT('servers');
  const isChannel = target.kind === 'channel';
  const [name, setName] = useState(target.name);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = isChannel ? await renameChannel(target.id, trimmed) : await renameCategory(target.id, trimmed);
    if (!('error' in res)) { window.dispatchEvent(new CustomEvent('server:changed')); onClose(); return; }
    setBusy(false);
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const res = isChannel ? await deleteChannel(target.id) : await deleteCategory(target.id);
    if (!('error' in res)) { window.dispatchEvent(new CustomEvent('server:changed')); onClose(); return; }
    setBusy(false);
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mt-name">{isChannel ? t('channelName') : t('categoryName')}</Label>
        <div className="relative">
          {isChannel
            ? <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            : <Folder className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
          <Input
            id="mt-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            maxLength={20}
            className="pl-9"
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
        <Button size="md" onClick={save} isLoading={busy} disabled={!name.trim() || name.trim() === target.name}>{t('save')}</Button>
      </div>

      <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" /> {t('dangerZone')}
        </p>
        {confirm ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted-foreground">{t('deleteTargetConfirm', { name: target.name })}</span>
            <Button variant="destructive" size="sm" onClick={remove} isLoading={busy}>{t('delete')}</Button>
          </div>
        ) : (
          <Button variant="destructive" size="sm" className="mt-3" onClick={() => setConfirm(true)}>
            {isChannel ? t('deleteChannel') : t('deleteCategory')}
          </Button>
        )}
      </div>
    </>
  );
}

export function ServerInviteModal({ serverId, vanity, onClose }: { serverId: string; vanity?: string | null; onClose: () => void }) {
  const t = useT('servers');
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    if (vanity) { setUrl(`${window.location.origin}/i/${vanity}`); return; }
    createServerInvite(serverId).then((res) => {
      if (active && 'token' in res && res.token) setUrl(`${window.location.origin}/i/${res.token}`);
    });
    return () => { active = false; };
  }, [serverId, vanity]);

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }

  return (
    <Modal title={t('inviteTitle')} onClose={onClose}>
      <p className="mt-1 text-sm text-muted-foreground">{t('inviteHint')}</p>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2.5">
        <input readOnly value={url ?? '…'} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="md" onClick={copy} disabled={!url}>{copied ? t('copied') : t('copy')}</Button>
      </div>
    </Modal>
  );
}
