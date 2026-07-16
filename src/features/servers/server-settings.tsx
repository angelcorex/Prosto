'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle, Crown, Camera, ImagePlus, CheckCircle, XCircle, Loader2, Link2, ChevronDown, Hash, Globe, Lock, Search, Ban, ShieldOff } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { Button, Input, Label, Textarea, ImageCropper, ServerVerifiedBadge, EmojiText } from '@/components/ui';
import { updateServerSettings, deleteServer, leaveServer, uploadServerAsset, setServerVanity, checkServerVanity, listServerBans, unbanMember, createServerInvite, listServerInvites, deleteServerInvite, setInvitesPaused, getInvitesPaused, type ServerBan, type ServerInvite } from './actions';
import { ServerRoles } from './roles/server-roles';
import { ServerEmojis } from './server-emojis';
import { MemberRoles } from './roles/member-roles';
import { MemberActionsMenu } from './moderation/member-actions-menu';
import { PERM, hasPerm } from './roles/permissions';
import { CreateInviteDialog } from './invites/create-invite-dialog';
import { useViewerAge } from '@/features/age';
type Tab = 'profile' | 'members' | 'roles' | 'emoji' | 'bans' | 'invites';
type VanityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'saved';

interface Member {
  id: string; username: string; display_name: string | null; avatar_url: string | null;
  is_verified: boolean; is_moderator: boolean; is_owner: boolean; timeout_until?: string | null;
}

const isGradient = (v: string | null | undefined): v is string => !!v && v.startsWith('linear-gradient');
const VANITY_RE = /^[a-z0-9][a-z0-9-]{1,19}$/;
const MAX_TAGS = 6;

export function ServerSettings({
  serverId, currentName, currentIcon, currentBanner, currentVanity = null,
  currentDescription = null, currentTags = [], currentIsPublic = false, currentIsNsfw = false,
  isVerified = false, isOwner, myPermissions = 0, onClose,
}: {
  serverId: string;
  currentName: string;
  currentIcon: string | null;
  currentBanner: string | null;
  currentVanity?: string | null;
  currentDescription?: string | null;
  currentTags?: string[];
  currentIsPublic?: boolean;
  currentIsNsfw?: boolean;
  isVerified?: boolean;
  isOwner: boolean;
  myPermissions?: number;
  onClose: () => void;
}) {
  const t = useT('servers');
  const ta = useT('age');
  const { isAdult: viewerAdult } = useViewerAge();
  const router = useRouter();
  const sbRef = useRef(createClient());

  const [tab, setTab] = useState<Tab>('profile');
  const [name, setName] = useState(currentName);
  const [icon, setIcon] = useState<string | null>(currentIcon);
  const [banner, setBanner] = useState<string | null>(currentBanner);
  const [description, setDescription] = useState(currentDescription ?? '');
  const [tags, setTags] = useState<string[]>(currentTags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [isPublic, setIsPublic] = useState(currentIsPublic);
  const [isNsfw, setIsNsfw] = useState(currentIsNsfw);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<null | 'icon' | 'banner'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [roleOptions, setRoleOptions] = useState<{ id: string; name: string; color: string | null; is_default: boolean }[]>([]);
  const canManageServer = isOwner || hasPerm(myPermissions, PERM.MANAGE_SERVER);
  const canManageRoles = isOwner || hasPerm(myPermissions, PERM.MANAGE_ROLES);
  const canKick = isOwner || hasPerm(myPermissions, PERM.KICK);
  const canBan = isOwner || hasPerm(myPermissions, PERM.BAN);
  const canTimeout = isOwner || hasPerm(myPermissions, PERM.TIMEOUT);
  const canModerate = canKick || canBan || canTimeout;
  const canManageInvites = isOwner || hasPerm(myPermissions, PERM.MANAGE_INVITES);
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [banQuery, setBanQuery] = useState('');
  const [bansLoading, setBansLoading] = useState(false);
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesPausedUntil, setInvitesPausedUntil] = useState<string | null>(null);
  const [pauseMenu, setPauseMenu] = useState(false);
  const [creatingInvite] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [crop, setCrop] = useState<null | { kind: 'icon' | 'banner'; src: string }>(null);
  const [vanity, setVanity] = useState(currentVanity ?? '');
  const [baseVanity, setBaseVanity] = useState((currentVanity ?? '').toLowerCase());
  const [vanityState, setVanityState] = useState<VanityState>('idle');
  const [vanitySaving, setVanitySaving] = useState(false);
  const iconRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const vanityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tagsChanged = tags.join('\u0001') !== (currentTags ?? []).join('\u0001');
  const dirty =
    name.trim() !== currentName ||
    icon !== currentIcon ||
    banner !== currentBanner ||
    description.trim() !== (currentDescription ?? '') ||
    tagsChanged ||
    isPublic !== currentIsPublic ||
    isNsfw !== currentIsNsfw;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Live availability check for the vanity (debounced), mirroring usernames.
  useEffect(() => {
    const v = vanity.trim().toLowerCase();
    if (vanityTimer.current) clearTimeout(vanityTimer.current);
    if (v === baseVanity) { setVanityState('idle'); return; }
    if (v === '') { setVanityState('idle'); return; }
    if (!VANITY_RE.test(v)) { setVanityState('invalid'); return; }
    setVanityState('checking');
    vanityTimer.current = setTimeout(async () => {
      const res = await checkServerVanity(v);
      if ('unchecked' in res && res.unchecked) setVanityState('idle');
      else setVanityState(res.available ? 'available' : 'taken');
    }, 450);
    return () => { if (vanityTimer.current) clearTimeout(vanityTimer.current); };
  }, [vanity, baseVanity]);

  async function saveVanity() {
    const v = vanity.trim().toLowerCase();
    if (vanitySaving) return;
    setVanitySaving(true);
    const res = await setServerVanity(serverId, v);
    setVanitySaving(false);
    if (!('error' in res)) {
      setBaseVanity(v);
      setVanityState('saved');
      window.dispatchEvent(new CustomEvent('server:changed'));
    } else {
      setVanityState(res.error === 'taken' ? 'taken' : 'invalid');
    }
  }

  const loadMembers = useCallback(async () => {
    const sb = sbRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).rpc('get_server_members', { p_server: serverId });
    if (Array.isArray(data)) setMembers(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rolesData } = await (sb as any).rpc('get_server_roles', { p_server: serverId });
    if (Array.isArray(rolesData)) setRoleOptions(rolesData);
  }, [serverId]);

  useEffect(() => { if (tab === 'members') loadMembers(); }, [tab, loadMembers]);

  function pick(kind: 'icon' | 'banner', file: File | undefined) {
    if (!file) return;
    setCrop({ kind, src: URL.createObjectURL(file) });
  }

  async function applyCrop(blob: Blob) {
    if (!crop) return;
    const { kind, src } = crop;
    URL.revokeObjectURL(src);
    setCrop(null);
    setUploading(kind);
    const fd = new FormData();
    fd.append('file', new File([blob], `${kind}.jpg`, { type: 'image/jpeg' }));
    const res = await uploadServerAsset(serverId, kind, fd);
    if ('url' in res && res.url) {
      // Local preview only — applied to the server when the user hits Save.
      if (kind === 'icon') setIcon(res.url); else setBanner(res.url);
    }
    setUploading(null);
  }

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    await updateServerSettings(serverId, {
      name: name.trim() !== currentName ? name.trim() : undefined,
      icon: icon !== currentIcon ? (icon ?? '') : undefined,
      banner: banner !== currentBanner ? (banner ?? '') : undefined,
      description: description.trim() !== (currentDescription ?? '') ? description.trim() : undefined,
      tags: tagsChanged ? tags : undefined,
      isPublic: isPublic !== currentIsPublic ? isPublic : undefined,
      isNsfw: isNsfw !== currentIsNsfw ? isNsfw : undefined,
    });
    window.dispatchEvent(new CustomEvent('server:changed'));
    window.dispatchEvent(new CustomEvent('servers:changed'));
    setBusy(false);
    onClose();
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9а-яё-]/gi, '').slice(0, 20);
    if (!tag) return;
    setTags((prev) => (prev.includes(tag) || prev.length >= MAX_TAGS ? prev : [...prev, tag]));
    setTagDraft('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((x) => x !== tag));
  }

  const loadBans = useCallback(async (q?: string) => {
    setBansLoading(true);
    const res = await listServerBans(serverId, q);
    setBansLoading(false);
    if ('bans' in res) setBans(res.bans);
  }, [serverId]);

  useEffect(() => { if (tab === 'bans') loadBans(); }, [tab, loadBans]);

  async function unban(userId: string) {
    await unbanMember(serverId, userId);
    setBans((prev) => prev.filter((b) => b.user_id !== userId));
  }

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    const [inv, paused] = await Promise.all([listServerInvites(serverId), getInvitesPaused(serverId)]);
    setInvitesLoading(false);
    if ('invites' in inv) setInvites(inv.invites);
    setInvitesPausedUntil(paused.until);
  }, [serverId]);

  useEffect(() => { if (tab === 'invites') loadInvites(); }, [tab, loadInvites]);

  const invitesPaused = !!invitesPausedUntil && (invitesPausedUntil === 'infinity' || new Date(invitesPausedUntil).getTime() > Date.now());

  async function removeInvite(token: string) {
    setInvites((prev) => prev.filter((i) => i.token !== token));
    await deleteServerInvite(serverId, token);
  }

  async function pauseInvites(seconds: number | null) {
    setPauseMenu(false);
    const res = await setInvitesPaused(serverId, seconds);
    if (!('error' in res)) setInvitesPausedUntil(res.until);
  }

  function fmtExpires(iso: string | null): string {
    if (!iso || iso === 'infinity') return '∞';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return t('inviteExpired');
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d) return `${d}${t('unitShortD')} ${h}${t('unitShortH')}`;
    if (h) return `${h}${t('unitShortH')} ${m}${t('unitShortM')}`;
    return `${m}${t('unitShortM')}`;
  }

  async function destroy() {
    setBusy(true);
    await deleteServer(serverId);
    window.dispatchEvent(new CustomEvent('servers:changed'));
    router.push(site.routes.feed);
    onClose();
  }

  async function leave() {
    setBusy(true);
    await leaveServer(serverId);
    window.dispatchEvent(new CustomEvent('servers:changed'));
    router.push(site.routes.feed);
    onClose();
  }

  const previewInitial = name.trim()[0]?.toUpperCase() ?? 'S';
  const inviteHost = (() => { try { return new URL(site.url).host.replace(/^www\./, ''); } catch { return 'prosto.ink'; } })();
  const vanityChanged = vanity.trim().toLowerCase() !== baseVanity;

  return (
    typeof document === 'undefined' ? null : createPortal(
    <div className="fixed inset-0 z-[55] flex justify-center bg-background">
      {/* Centred settings group (nav + content) so it never looks lopsided. */}
      <div className="flex h-full w-full max-w-[1160px]">
        {/* Navigation */}
        <nav className="settings-nav flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto py-14 pl-6 pr-4">
          <p className="truncate px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{name.trim() || t('settings')}</p>
          <TabButton active={tab === 'profile'} onClick={() => setTab('profile')}>{t('tabProfile')}</TabButton>

          {(canManageServer || canManageRoles || canModerate || canManageInvites) && <NavHeader>{t('groupPeople')}</NavHeader>}
          {(canManageServer || canManageRoles || canModerate) && <TabButton active={tab === 'members'} onClick={() => setTab('members')}>{t('tabMembers')}</TabButton>}
          {canManageRoles && <TabButton active={tab === 'roles'} onClick={() => setTab('roles')}>{t('tabRoles')}</TabButton>}
          {canManageInvites && <TabButton active={tab === 'invites'} onClick={() => setTab('invites')}>{t('tabInvites')}</TabButton>}

          {canManageServer && (
            <>
              <NavHeader>{t('groupExpression')}</NavHeader>
              <TabButton active={tab === 'emoji'} onClick={() => setTab('emoji')}>{t('tabEmoji')}</TabButton>
            </>
          )}

          {canBan && (
            <>
              <NavHeader>{t('groupModeration')}</NavHeader>
              <TabButton active={tab === 'bans'} onClick={() => setTab('bans')}>{t('tabBans')}</TabButton>
            </>
          )}

          <div className="mt-2 border-t border-border/40 pt-2">
            {isOwner ? (
              <button type="button" onClick={() => { setTab('profile'); setConfirmDelete(true); }} className="w-full rounded-lg px-3 py-2 text-left text-[14px] font-medium text-destructive transition-colors hover:bg-destructive/10">
                {t('deleteServer')}
              </button>
            ) : (
              <button type="button" onClick={leave} className="w-full rounded-lg px-3 py-2 text-left text-[14px] font-medium text-destructive transition-colors hover:bg-destructive/10">
                {t('leaveServer')}
              </button>
            )}
          </div>
        </nav>

        {/* Content (centred within the remaining space) */}
        <div className="relative flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-[840px] px-10 py-14">
            {tab === 'profile' && (
              <>
              <h1 className="mb-8 text-2xl font-bold tracking-tight">{t('tabProfile')}</h1>

              <div className="flex flex-col gap-10 lg:flex-row">
                {/* Form */}
                <div className="flex min-w-0 flex-1 flex-col gap-7">
                  {canManageServer ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="srv-name">{t('name')}</Label>
                        <Input id="srv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                      </div>

                      {/* Icon */}
                      <div className="flex flex-col gap-2">
                        <Label>{t('icon')}</Label>
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() => iconRef.current?.click()}
                            disabled={uploading === 'icon'}
                            className={cn('group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full bg-link/15 ring-2 ring-border/50 transition-all hover:ring-link/50', uploading === 'icon' && 'opacity-60')}
                            aria-label={t('changeIcon')}
                          >
                            {icon
                              ? <Image src={icon} alt="" fill sizes="72px" className="object-cover" />
                              : <span className="flex h-full w-full items-center justify-center text-3xl font-black text-link">{previewInitial}</span>}
                            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"><Camera className="h-5 w-5 text-white" /></span>
                          </button>
                          <div className="flex flex-col gap-1">
                            <button type="button" onClick={() => iconRef.current?.click()} className="w-fit text-sm font-medium text-link hover:underline">{t('changeIcon')}</button>
                            {icon && <button type="button" onClick={() => setIcon(null)} className="w-fit text-sm text-muted-foreground hover:text-destructive">{t('removeImage')}</button>}
                          </div>
                        </div>
                        <input ref={iconRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => { pick('icon', e.target.files?.[0]); e.target.value = ''; }} />
                      </div>

                      {/* Banner */}
                      <div className="flex flex-col gap-2.5">
                        <Label>{t('banner')}</Label>
                        {/* Clickable banner area (same editing UX as the profile banner). */}
                        <button
                          type="button"
                          onClick={() => bannerRef.current?.click()}
                          disabled={uploading === 'banner'}
                          className={cn('group relative h-28 w-full overflow-hidden rounded-2xl bg-secondary', uploading === 'banner' && 'opacity-60')}
                          aria-label={t('changeBanner')}
                        >
                          {isGradient(banner) ? (
                            <span className="absolute inset-0" style={{ backgroundImage: banner }} />
                          ) : banner ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
                          ) : null}
                          <span className={cn('absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 transition-opacity', uploading === 'banner' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                            <span className="flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                              <ImagePlus className="h-3.5 w-3.5" /> {t('uploadBanner')}
                            </span>
                          </span>
                        </button>
                        {banner && <button type="button" onClick={() => setBanner(null)} className="w-fit text-sm text-muted-foreground hover:text-destructive">{t('removeImage')}</button>}
                        <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { pick('banner', e.target.files?.[0]); e.target.value = ''; }} />
                      </div>

                      {/* Custom invite link (vanity) */}
                      <div className="flex flex-col gap-2">
                        <Label>{t('vanityLabel')}</Label>
                        <div className="flex items-center gap-2">
                          <div className={cn('flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-secondary/50 px-3 ring-1 ring-transparent', vanityState === 'taken' || vanityState === 'invalid' ? 'ring-destructive/40' : vanityState === 'available' ? 'ring-success/40' : '')}>
                            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                            <span className="shrink-0 text-[13px] text-muted-foreground/60">{inviteHost}/i/</span>
                            <input
                              value={vanity}
                              onChange={(e) => setVanity(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                              maxLength={20}
                              placeholder="genshinimpact"
                              spellCheck={false}
                              className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] outline-none"
                            />
                            {vanityState === 'checking' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                            {(vanityState === 'available' || vanityState === 'saved') && <CheckCircle className="h-4 w-4 shrink-0 text-success" />}
                            {(vanityState === 'taken' || vanityState === 'invalid') && <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                          </div>
                          <Button
                            size="md"
                            onClick={saveVanity}
                            isLoading={vanitySaving}
                            disabled={!vanityChanged || vanityState === 'checking' || vanityState === 'taken' || vanityState === 'invalid'}
                            className="shrink-0"
                          >
                            {t('save')}
                          </Button>
                        </div>
                        <p className={cn('text-xs',
                          vanityState === 'taken' || vanityState === 'invalid' ? 'text-destructive'
                          : vanityState === 'available' || vanityState === 'saved' ? 'text-success'
                          : 'text-muted-foreground')}>
                          {vanityState === 'taken' ? t('vanityTaken')
                            : vanityState === 'invalid' ? t('vanityInvalid')
                            : vanityState === 'available' ? t('vanityAvailable')
                            : vanityState === 'saved' ? t('vanitySaved')
                            : t('vanityHint')}
                        </p>
                      </div>

                      {/* Description */}
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="srv-desc">{t('description')}</Label>
                        <Textarea
                          id="srv-desc"
                          value={description}
                          onChange={(e) => setDescription(e.target.value.slice(0, 300))}
                          maxLength={300}
                          rows={3}
                          placeholder={t('descriptionPlaceholder')}
                        />
                        <p className="text-xs text-muted-foreground/60">{description.length}/300</p>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="srv-tags">{t('tags')}</Label>
                        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-secondary/50 px-3 py-2">
                          {tags.map((tag) => (
                            <span key={tag} className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[13px] font-medium">
                              #{tag}
                              <button type="button" onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          {tags.length < MAX_TAGS && (
                            <input
                              id="srv-tags"
                              value={tagDraft}
                              onChange={(e) => setTagDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); }
                                else if (e.key === 'Backspace' && !tagDraft && tags.length) removeTag(tags[tags.length - 1]!);
                              }}
                              onBlur={() => addTag(tagDraft)}
                              placeholder={tags.length ? '' : t('tagsPlaceholder')}
                              className="min-w-[120px] flex-1 bg-transparent py-1 text-[14px] outline-none placeholder:text-muted-foreground/50"
                            />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/60">{t('tagsHint')}</p>
                      </div>

                      {/* Visibility */}
                      <div className="flex flex-col gap-2">
                        <Label>{t('visibility')}</Label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsPublic(true)}
                            className={cn(
                              'flex flex-1 items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                              isPublic ? 'border-link bg-link/5' : 'border-border/50 hover:bg-accent/40',
                            )}
                          >
                            <Globe className={cn('mt-0.5 h-5 w-5 shrink-0', isPublic ? 'text-link' : 'text-muted-foreground')} />
                            <span className="min-w-0">
                              <span className="block text-[14px] font-semibold">{t('public')}</span>
                              <span className="block text-[12px] text-muted-foreground">{t('publicHint')}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsPublic(false)}
                            className={cn(
                              'flex flex-1 items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                              !isPublic ? 'border-link bg-link/5' : 'border-border/50 hover:bg-accent/40',
                            )}
                          >
                            <Lock className={cn('mt-0.5 h-5 w-5 shrink-0', !isPublic ? 'text-link' : 'text-muted-foreground')} />
                            <span className="min-w-0">
                              <span className="block text-[14px] font-semibold">{t('private')}</span>
                              <span className="block text-[12px] text-muted-foreground">{t('privateHint')}</span>
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Age restriction (18+) — only adults may enable it. */}
                      <div className="flex flex-col gap-2">
                        <Label>{ta('serverNsfwLabel')}</Label>
                        <button
                          type="button"
                          onClick={() => { if (viewerAdult) setIsNsfw((v) => !v); }}
                          aria-pressed={isNsfw}
                          disabled={!viewerAdult}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors',
                            !viewerAdult ? 'cursor-not-allowed border-border/40 opacity-60'
                              : isNsfw ? 'border-destructive/60 bg-destructive/5' : 'border-border/50 hover:bg-accent/40',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block text-[14px] font-semibold">{ta('serverNsfwLabel')}</span>
                            <span className="block text-[12px] text-muted-foreground">{viewerAdult ? ta('serverNsfwHint') : ta('serverNsfwLocked')}</span>
                          </span>
                          <span className={cn('flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', isNsfw ? 'bg-destructive' : 'bg-muted')}>
                            <span className={cn('h-5 w-5 rounded-full bg-white transition-transform', isNsfw && 'translate-x-5')} />
                          </span>
                        </button>
                      </div>

                      {/* Danger zone — owner only */}
                      {isOwner && (
                      <div className="mt-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                        <p className="flex items-center gap-2 text-[13px] font-semibold text-destructive">
                          <AlertTriangle className="h-4 w-4" /> {t('dangerZone')}
                        </p>
                        {confirmDelete ? (
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-[13px] text-muted-foreground">{t('deleteConfirm')}</span>
                            <Button variant="destructive" size="sm" onClick={destroy} isLoading={busy}>{t('deleteServer')}</Button>
                          </div>
                        ) : (
                          <Button variant="destructive" size="sm" className="mt-3" onClick={() => setConfirmDelete(true)}>{t('deleteServer')}</Button>
                        )}
                      </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-border/40 bg-card p-4">
                      <p className="text-[13px] text-muted-foreground">{t('leaveHint')}</p>
                      <Button variant="destructive" size="md" className="mt-4 w-full" onClick={leave} isLoading={busy}>{t('leaveServer')}</Button>
                    </div>
                  )}
                </div>

                {/* Live preview — mirrors the real icon rail + channel header */}
                <aside className="w-full shrink-0 lg:w-[320px]">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t('preview')}</p>
                  <div className="flex overflow-hidden rounded-2xl border border-border/40 bg-background shadow-sm">
                    {/* Icon rail — how the server avatar looks in the list */}
                    <div className="flex w-[60px] shrink-0 flex-col items-center gap-2 border-r border-border/20 bg-card/40 py-3">
                      <button
                        type="button"
                        onClick={() => isOwner && iconRef.current?.click()}
                        className="group relative flex h-11 w-11 items-center justify-center"
                        aria-label={t('changeIcon')}
                      >
                        <span className="absolute -left-3 h-6 w-1 rounded-full bg-link" />
                        <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-accent text-foreground">
                          {icon
                            ? <Image src={icon} alt="" width={40} height={40} className="h-full w-full object-cover" />
                            : <span className="text-sm font-bold">{previewInitial}</span>}
                          {isOwner && <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"><Camera className="h-4 w-4 text-white" /></span>}
                        </span>
                      </button>
                    </div>

                    {/* Channel sidebar header — banner + name exactly as rendered */}
                    <div className="min-w-0 flex-1 bg-card/40">
                      <button
                        type="button"
                        onClick={() => isOwner && bannerRef.current?.click()}
                        className={cn('group relative flex w-full overflow-hidden text-left', banner ? 'h-24 items-start' : 'h-12 items-center')}
                        aria-label={t('changeBanner')}
                      >
                        {banner && (
                          <>
                            {isGradient(banner)
                              ? <span className="absolute inset-0" style={{ backgroundImage: banner }} />
                              // eslint-disable-next-line @next/next/no-img-element
                              : <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                            <span className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/25 to-transparent" />
                          </>
                        )}
                        <span className={cn('relative flex w-full items-center gap-1.5 px-3 py-3', banner && 'text-white')}>
                          {isVerified && <ServerVerifiedBadge size="sm" />}
                          <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{name.trim() || t('namePlaceholder')}</span>
                          <ChevronDown className={cn('h-4 w-4 shrink-0', banner ? 'text-white/80' : 'text-muted-foreground')} />
                        </span>
                        {isOwner && <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100"><ImagePlus className="h-5 w-5 text-white" /></span>}
                      </button>
                      {/* a couple of real-style channel rows for context */}
                      <div className="space-y-0.5 px-2 py-2">
                        <span className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-[13px] text-foreground"><Hash className="h-4 w-4 text-muted-foreground/60" />general</span>
                        <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground/60"><Hash className="h-4 w-4 text-muted-foreground/50" />chat</span>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}

          {tab === 'members' && (
            <>
              <h1 className="mb-8 text-2xl font-bold tracking-tight">{t('tabMembers')} — {members.length}</h1>
              <div className="flex max-w-xl flex-col gap-1">
                {members.map((mem) => {
                  const mName = mem.display_name ?? mem.username;
                  const initial = mName[0]?.toUpperCase() ?? '?';
                  return (
                    <div key={mem.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/40">
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                        {mem.avatar_url
                          ? <AvatarImage src={mem.avatar_url} alt={mName} sizes="36px" className="object-cover" />
                          : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{initial}</span>}
                      </div>
                      <EmojiText content={mName} clamp className="min-w-0 flex-1 truncate text-[14px] font-medium" />
                      {canManageRoles && !mem.is_owner && (
                        <MemberRoles serverId={serverId} memberId={mem.id} roles={roleOptions} />
                      )}
                      {mem.is_owner
                        ? <Crown className="h-4 w-4 shrink-0 text-warning" />
                        : <MemberActionsMenu serverId={serverId} member={mem} isOwner={isOwner} canKick={canKick} canBan={canBan} canTimeout={canTimeout} onChanged={loadMembers} />}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {tab === 'roles' && <ServerRoles serverId={serverId} />}
          {tab === 'emoji' && <ServerEmojis serverId={serverId} />}
          {tab === 'bans' && (
            <>
              <h1 className="mb-2 text-2xl font-bold tracking-tight">{t('tabBans')}</h1>
              <p className="mb-6 max-w-xl text-[13px] text-muted-foreground">{t('bansIntro')}</p>
              <form
                onSubmit={(e) => { e.preventDefault(); loadBans(banQuery.trim() || undefined); }}
                className="mb-4 flex max-w-xl items-center gap-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-secondary/50 px-3">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  <input
                    value={banQuery}
                    onChange={(e) => setBanQuery(e.target.value)}
                    placeholder={t('banSearchPlaceholder')}
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] outline-none"
                  />
                </div>
                <Button size="md" type="submit" isLoading={bansLoading}>{t('search')}</Button>
              </form>

              {bans.length === 0 ? (
                <div className="flex max-w-xl flex-col items-center justify-center gap-2 rounded-2xl border border-border/40 py-16 text-center">
                  <Ban className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-[15px] font-semibold text-muted-foreground">{t('noBans')}</p>
                  <p className="max-w-[280px] text-[13px] text-muted-foreground/60">{t('noBansHint')}</p>
                </div>
              ) : (
                <div className="flex max-w-xl flex-col gap-1">
                  {bans.map((b) => {
                    const bName = b.display_name ?? b.username;
                    const initial = bName[0]?.toUpperCase() ?? '?';
                    return (
                      <div key={b.user_id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/40">
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                          {b.avatar_url
                            ? <AvatarImage src={b.avatar_url} alt={bName} sizes="36px" className="object-cover" />
                            : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{initial}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium"><EmojiText content={bName} clamp /> <span className="text-[12px] font-normal text-muted-foreground">@{b.username}</span></p>
                          <p className="truncate text-[12px] text-muted-foreground">{b.reason || t('bannedNoReason')}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => unban(b.user_id)}
                          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium text-link transition-colors hover:bg-link/10"
                        >
                          <ShieldOff className="h-3.5 w-3.5" /> {t('unban')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'invites' && (
            <>
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{t('tabInvites')}</h1>
                  <p className="mt-1 max-w-lg text-[13px] text-muted-foreground">{t('invitesIntro')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="relative">
                    {invitesPaused ? (
                      <Button variant="secondary" size="md" onClick={() => pauseInvites(null)}>{t('resumeInvites')}</Button>
                    ) : (
                      <Button variant="secondary" size="md" onClick={() => setPauseMenu((v) => !v)}>{t('pauseInvites')}</Button>
                    )}
                    {pauseMenu && !invitesPaused && (
                      <div className="surface-solid absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-xl border border-border py-1 shadow-2xl">
                        <button type="button" onClick={() => pauseInvites(3600)} className="block w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent/60">{t('pause1h')}</button>
                        <button type="button" onClick={() => pauseInvites(86400)} className="block w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent/60">{t('pause1d')}</button>
                        <button type="button" onClick={() => pauseInvites(0)} className="block w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent/60">{t('pauseUntilOn')}</button>
                      </div>
                    )}
                  </div>
                  <Button size="md" onClick={() => setInviteDialogOpen(true)} isLoading={creatingInvite}>{t('createInviteLink')}</Button>
                </div>
              </div>

              {invitesPaused && (
                <div className="mb-4 flex max-w-2xl items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[13px] font-medium text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {invitesPausedUntil === 'infinity' ? t('invitesPausedIndef') : t('invitesPausedUntilLabel', { time: fmtExpires(invitesPausedUntil) })}
                </div>
              )}

              {invitesLoading && invites.length === 0 ? (
                <p className="text-[13px] text-muted-foreground/60">…</p>
              ) : invites.length === 0 ? (
                <div className="flex max-w-2xl flex-col items-center justify-center gap-2 rounded-2xl border border-border/40 py-16 text-center">
                  <Link2 className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-[15px] font-semibold text-muted-foreground">{t('noInvites')}</p>
                </div>
              ) : (
                <div className="max-w-2xl overflow-hidden rounded-2xl border border-border/40">
                  <div className="grid grid-cols-[1.6fr_1.2fr_0.5fr_0.5fr_1fr_auto] gap-3 border-b border-border/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    <span>{t('inviteInviter')}</span>
                    <span>{t('inviteCode')}</span>
                    <span>{t('inviteUses')}</span>
                    <span>{t('inviteMax')}</span>
                    <span>{t('inviteExpires')}</span>
                    <span />
                  </div>
                  {invites.map((inv) => {
                    const iName = inv.inviter_display_name ?? inv.inviter_username;
                    const iInitial = iName[0]?.toUpperCase() ?? '?';
                    return (
                      <div key={inv.token} className="grid grid-cols-[1.6fr_1.2fr_0.5fr_0.5fr_1fr_auto] items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-accent/30">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-secondary">
                            {inv.inviter_avatar_url
                              ? <AvatarImage src={inv.inviter_avatar_url} alt={iName} sizes="28px" className="object-cover" />
                              : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-link">{iInitial}</span>}
                          </div>
                          <EmojiText content={iName} clamp className="min-w-0 truncate font-medium" />
                        </div>
                        <span className="truncate font-mono text-muted-foreground">{inv.token}</span>
                        <span className="tabular-nums text-muted-foreground">{inv.uses}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {inv.max_uses == null ? '∞' : `/${inv.max_uses}`}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{fmtExpires(inv.expires_at)}</span>
                        <button
                          type="button"
                          onClick={() => removeInvite(inv.token)}
                          title={t('deleteInvite')}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Save bar */}
        {canManageServer && tab === 'profile' && dirty && (
          <div className="sticky bottom-6 z-10 mx-auto flex max-w-xl items-center justify-between gap-4 rounded-xl border border-border/50 bg-card px-4 py-3 shadow-2xl">
            <span className="text-[13px] text-muted-foreground">{t('unsavedChanges')}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setName(currentName); setIcon(currentIcon); setBanner(currentBanner); setDescription(currentDescription ?? ''); setTags(currentTags ?? []); setIsPublic(currentIsPublic); setIsNsfw(currentIsNsfw); }}>{t('reset')}</Button>
              <Button size="sm" onClick={save} isLoading={busy} disabled={!name.trim()}>{t('save')}</Button>
            </div>
          </div>
        )}
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

      {crop && (
        <ImageCropper
          src={crop.src}
          shape={crop.kind === 'icon' ? 'circle' : 'rect'}
          aspect={crop.kind === 'banner' ? 2.5 : 1}
          outputWidth={crop.kind === 'icon' ? 512 : 1000}
          onCancel={() => { URL.revokeObjectURL(crop.src); setCrop(null); }}
          onApply={applyCrop}
        />
      )}

      {inviteDialogOpen && (
        <CreateInviteDialog
          serverId={serverId}
          onClose={() => setInviteDialogOpen(false)}
          onCreated={loadInvites}
        />
      )}
    </div>,
    document.body,
    )
  );
}

function NavHeader({ children }: { children: React.ReactNode }) {
  return <p className="truncate px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">{children}</p>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl px-3.5 py-2.5 text-left text-[14px] font-medium transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
