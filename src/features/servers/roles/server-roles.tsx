'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Plus, Trash2, ImagePlus, Loader2, Shield, Pencil, User, Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { Button, Input, Label, ColorPicker, renderEmojiNodes } from '@/components/ui';
import { PERM, ROLE_COLORS, ROLE_GRADIENTS, DEFAULT_ROLE_COLOR, DEFAULT_ROLE_COLOR_2, ROLE_FALLBACK_COLOR, PERM_TREE, hasPerm, roleNameStyle, roleNameClass, type PermNode } from './permissions';
import { createRole, updateRole, deleteRole, uploadRoleIcon, reorderRoles } from '../actions';

type MentionMode = 'everyone' | 'none' | 'selected';

interface Role {
  id: string; name: string; color: string | null; color2: string | null; glow: string | null;
  icon_url: string | null; permissions: number; position: number; is_default: boolean;
  hoist: boolean; mention_mode: MentionMode; extra_perms: string[];
}

interface MemberOpt { id: string; username: string; display_name: string | null }

export function ServerRoles({ serverId }: { serverId: string }) {
  const t = useT('servers');
  const sbRef = useRef(createClient());
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const iconRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder state: the role being dragged and the insertion gap
  // (index within the non-default role list) the drop indicator points at.
  const [dragRoleId, setDragRoleId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);

  // Editor draft for the selected role.
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [color2, setColor2] = useState<string | null>(null);
  const [glow, setGlow] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [perms, setPerms] = useState(0);
  const [extra, setExtra] = useState<Set<string>>(new Set());
  const [origExtra, setOrigExtra] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hoist, setHoist] = useState(false);
  const [mentionMode, setMentionMode] = useState<MentionMode>('everyone');
  const [allow, setAllow] = useState<Set<string>>(new Set());
  const [origAllow, setOrigAllow] = useState<string[]>([]);
  const [picker, setPicker] = useState<'color' | 'color2' | 'glow' | null>(null);

  const load = useCallback(async (keep?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sbRef.current as any).rpc('get_server_roles', { p_server: serverId });
    const list: Role[] = (Array.isArray(data) ? data : []).map((r: Role) => ({ ...r, permissions: Number(r.permissions) || 0 }));
    setRoles(list);
    const pick = keep ?? selectedId ?? list.find((r) => !r.is_default)?.id ?? list[0]?.id ?? null;
    if (pick) selectRole(list.find((r) => r.id === pick) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, selectedId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('get_server_members', { p_server: serverId }).then(({ data }: { data: MemberOpt[] | null }) => {
      if (Array.isArray(data)) setMembers(data.map((m) => ({ id: m.id, username: m.username, display_name: m.display_name })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  // Load the mention allow-list whenever the selected role changes.
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('get_role_mention_allow', { p_role: selectedId }).then(({ data }: { data: { profile_id: string }[] | null }) => {
      if (!active) return;
      const ids = Array.isArray(data) ? data.map((r) => r.profile_id) : [];
      setAllow(new Set(ids));
      setOrigAllow(ids);
    });
    return () => { active = false; };
  }, [selectedId]);

  function selectRole(r: Role | null) {
    if (!r) { setSelectedId(null); return; }
    setSelectedId(r.id);
    setName(r.name);
    setColor(r.color);
    setColor2(r.color2);
    setGlow(r.glow);
    setIcon(r.icon_url);
    setPerms(r.permissions);
    setExtra(new Set(r.extra_perms ?? []));
    setOrigExtra(r.extra_perms ?? []);
    setHoist(r.hoist);
    setMentionMode(r.mention_mode ?? 'everyone');
    setPicker(null);
  }

  const selected = roles.find((r) => r.id === selectedId) ?? null;
  const gradient = color2 != null;
  const allowChanged = allow.size !== origAllow.length || [...allow].some((id) => !origAllow.includes(id));
  const extraChanged = extra.size !== origExtra.length || [...extra].some((k) => !origExtra.includes(k));
  const dirty = selected && (
    name.trim() !== selected.name || color !== selected.color || color2 !== selected.color2
    || glow !== selected.glow || icon !== selected.icon_url || perms !== selected.permissions
    || hoist !== selected.hoist || mentionMode !== (selected.mention_mode ?? 'everyone')
    || (mentionMode === 'selected' && allowChanged) || extraChanged
  );

  async function onCreate() {
    setBusy(true);
    const res = await createRole(serverId, t('roleNewName'));
    setBusy(false);
    if ('id' in res && res.id) { await load(res.id); window.dispatchEvent(new CustomEvent('server:changed')); }
  }

  async function onSave() {
    if (!selected || !dirty) return;
    setBusy(true);
    await updateRole(selected.id, {
      name: selected.is_default ? undefined : name.trim(),
      color: selected.is_default ? undefined : color,
      color2: selected.is_default ? undefined : color2,
      glow: selected.is_default ? undefined : glow,
      icon: selected.is_default ? undefined : icon,
      permissions: perms,
      hoist: selected.is_default ? undefined : hoist,
      mentionMode: selected.is_default ? undefined : mentionMode,
      mentionAllow: !selected.is_default && mentionMode === 'selected' ? [...allow] : undefined,
      extra: [...extra],
    });
    setBusy(false);
    window.dispatchEvent(new CustomEvent('server:changed'));
    await load(selected.id);
  }

  async function onDelete() {
    if (!selected || selected.is_default) return;
    setBusy(true);
    await deleteRole(selected.id);
    setBusy(false);
    setSelectedId(null);
    window.dispatchEvent(new CustomEvent('server:changed'));
    await load();
  }

  async function pickIcon(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadRoleIcon(serverId, fd);
    setUploading(false);
    if ('url' in res && res.url) setIcon(res.url);
  }

  function togglePerm(bit: number) {
    setPerms((p) => (p & bit ? p & ~bit : p | bit));
  }

  function toggleExtra(key: string) {
    setExtra((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function nodeChecked(node: PermNode) {
    return node.bit != null ? hasPerm(perms, node.bit) : extra.has(node.key);
  }
  function nodeToggle(node: PermNode) {
    if (node.bit != null) togglePerm(node.bit); else toggleExtra(node.key);
  }

  // Administrator implicitly grants everything, so every other permission shows
  // as checked-and-locked while it's on (matches the server_perms expansion).
  const isAdmin = hasPerm(perms, PERM.ADMINISTRATOR);
  const forcedBy = (node: PermNode) => isAdmin && node.bit !== PERM.ADMINISTRATOR;

  function setSolid() { setColor2(null); setPicker(null); }
  function setGradient() {
    if (!color) setColor(DEFAULT_ROLE_COLOR);
    setColor2((c) => c ?? DEFAULT_ROLE_COLOR_2);
  }

  function toggleAllow(id: string) {
    setAllow((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // ── Drag-to-reorder roles ──────────────────────────────────────────────
  // The default '@everyone' role is pinned at the bottom and isn't draggable;
  // everything else can be reordered. The list is shown highest-first, so the
  // topmost role gets the largest `position`.
  const nonDefaultRoles = roles.filter((r) => !r.is_default);
  const everyoneRole = roles.find((r) => r.is_default) ?? null;

  function sortRoles(a: Role, b: Role) {
    if (a.is_default !== b.is_default) return a.is_default ? 1 : -1;
    return b.position - a.position;
  }

  function onRoleDragOver(e: React.DragEvent, index: number) {
    if (!dragRoleId) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    setDropGap(after ? index + 1 : index);
  }

  function onRoleDrop() {
    const dragId = dragRoleId;
    const gap = dropGap;
    setDragRoleId(null);
    setDropGap(null);
    if (!dragId || gap == null) return;

    const original = nonDefaultRoles.map((r) => r.id);
    const from = original.indexOf(dragId);
    if (from < 0) return;
    const next = original.slice();
    next.splice(from, 1);
    const insertAt = gap > from ? gap - 1 : gap;
    next.splice(insertAt, 0, dragId);
    if (next.join('|') === original.join('|')) return; // dropped in place

    const n = next.length;
    const posById = new Map(next.map((id, i) => [id, n - i])); // top = highest position
    setRoles((prev) => prev.map((r) => (posById.has(r.id) ? { ...r, position: posById.get(r.id)! } : r)).sort(sortRoles));
    reorderRoles(serverId, next.map((id, i) => ({ id, position: n - i })));
  }

  const previewTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{t('tabRoles')}</h1>

      <div className="flex gap-6">
        {/* Role list */}
        <div className="w-[220px] shrink-0">
          <button
            type="button"
            onClick={onCreate}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-link/15 py-2 text-[13px] font-semibold text-link transition-colors hover:bg-link/25"
          >
            <Plus className="h-4 w-4" /> {t('createRole')}
          </button>
          <div className="flex flex-col gap-0.5">
            {nonDefaultRoles.map((r, i) => (
              <div
                key={r.id}
                draggable
                onDragStart={() => setDragRoleId(r.id)}
                onDragEnd={() => { setDragRoleId(null); setDropGap(null); }}
                onDragOver={(e) => onRoleDragOver(e, i)}
                onDrop={(e) => { e.preventDefault(); onRoleDrop(); }}
                className="relative cursor-grab active:cursor-grabbing"
              >
                {dropGap === i && (
                  <span className="pointer-events-none absolute inset-x-1 -top-[3px] z-10 h-0.5 rounded-full bg-link" />
                )}
                <RoleRow r={r} selected={selectedId === r.id} dragging={dragRoleId === r.id} onSelect={() => selectRole(r)} />
                {dropGap === nonDefaultRoles.length && i === nonDefaultRoles.length - 1 && (
                  <span className="pointer-events-none absolute inset-x-1 -bottom-[3px] z-10 h-0.5 rounded-full bg-link" />
                )}
              </div>
            ))}
            {everyoneRole && (
              <RoleRow r={everyoneRole} selected={selectedId === everyoneRole.id} onSelect={() => selectRole(everyoneRole)} />
            )}
          </div>
        </div>

        {/* Editor */}
        {selected ? (
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {/* Live preview — a realistic chat message */}
            <div className="rounded-xl bg-background p-4 ring-1 ring-border/40">
              <p className="mb-2.5 text-[11px] uppercase tracking-wider text-muted-foreground/50">{t('rolePreview')}</p>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-link/20 text-link">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className={cn('text-[15px] font-semibold leading-tight', roleNameClass(color, color2))} style={roleNameStyle(color, color2, glow)}>
                      {name.trim() || t('roleNewName')}
                    </span>
                    {icon && <Image src={icon} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" unoptimized />}
                    <span className="text-[11px] text-muted-foreground/50">{previewTime}</span>
                  </div>
                  <p className="text-[14px] leading-relaxed text-foreground/90">{t('rolePreviewMsg')}</p>
                </div>
              </div>
            </div>

            {!selected.is_default && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="role-name">{t('roleName')}</Label>
                  <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
                </div>

                {/* Colour style: solid vs gradient */}
                <div className="flex flex-col gap-3">
                  <Label>{t('roleColor')}</Label>
                  <div className="flex w-fit rounded-lg bg-secondary/60 p-0.5 text-[13px] font-medium">
                    <button type="button" onClick={setSolid} className={cn('rounded-md px-3 py-1.5 transition-colors', !gradient ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{t('roleColorSolid')}</button>
                    <button type="button" onClick={setGradient} className={cn('rounded-md px-3 py-1.5 transition-colors', gradient ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{t('roleGradient')}</button>
                  </div>

                  {!gradient ? (
                    <div className="relative flex flex-wrap items-center gap-1.5">
                      {ROLE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={cn('h-7 w-7 rounded-full ring-2 transition-transform hover:scale-110', color === c ? 'ring-foreground' : 'ring-transparent')}
                          style={{ backgroundColor: c }}
                          aria-label={c}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => setPicker((p) => (p === 'color' ? null : 'color'))}
                        title={t('roleColorCustom')}
                        className={cn('flex h-7 w-7 items-center justify-center rounded-full ring-2', picker === 'color' ? 'ring-foreground' : 'ring-border/60')}
                        style={{ backgroundColor: color ?? 'transparent' }}
                      >
                        <Pencil className={cn('h-3.5 w-3.5', color ? 'text-white' : 'text-muted-foreground')} />
                      </button>
                      {picker === 'color' && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
                          <div className="absolute left-0 top-full z-50 mt-2">
                            <ColorPicker value={color ?? DEFAULT_ROLE_COLOR} onChange={setColor} />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {/* Ready-made gradient templates */}
                      <div className="flex flex-wrap gap-1.5">
                        {ROLE_GRADIENTS.map(([a, b]) => {
                          const active = color === a && color2 === b;
                          return (
                            <button
                              key={a + b}
                              type="button"
                              onClick={() => { setColor(a); setColor2(b); }}
                              className={cn('h-7 w-12 rounded-md ring-2 transition-transform hover:scale-105', active ? 'ring-foreground' : 'ring-transparent')}
                              style={{ backgroundImage: `linear-gradient(90deg, ${a}, ${b})` }}
                              aria-label={`${a} ${b}`}
                            />
                          );
                        })}
                      </div>

                      {/* Live gradient preview */}
                      <span
                        className="role-grad-shimmer h-9 w-full rounded-lg"
                        style={{ backgroundImage: `linear-gradient(90deg, ${color ?? DEFAULT_ROLE_COLOR}, ${color2}, ${color ?? DEFAULT_ROLE_COLOR})`, backgroundSize: '200% auto' }}
                      />

                      {/* Start / end custom colours — pickers open below */}
                      <div className="relative flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPicker((p) => (p === 'color' ? null : 'color'))}
                            className={cn('flex h-8 w-8 items-center justify-center rounded-lg ring-2', picker === 'color' ? 'ring-foreground' : 'ring-border/60')}
                            style={{ backgroundColor: color ?? DEFAULT_ROLE_COLOR }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-white" />
                          </button>
                          <span className="text-[12px] text-muted-foreground">{t('gradientStart')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPicker((p) => (p === 'color2' ? null : 'color2'))}
                            className={cn('flex h-8 w-8 items-center justify-center rounded-lg ring-2', picker === 'color2' ? 'ring-foreground' : 'ring-border/60')}
                            style={{ backgroundColor: color2 ?? DEFAULT_ROLE_COLOR_2 }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-white" />
                          </button>
                          <span className="text-[12px] text-muted-foreground">{t('gradientEnd')}</span>
                        </div>

                        {picker === 'color' && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
                            <div className="absolute left-0 top-full z-50 mt-2">
                              <ColorPicker value={color ?? DEFAULT_ROLE_COLOR} onChange={setColor} />
                            </div>
                          </>
                        )}
                        {picker === 'color2' && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
                            <div className="absolute left-0 top-full z-50 mt-2">
                              <ColorPicker value={color2 ?? DEFAULT_ROLE_COLOR_2} onChange={setColor2} />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Glow — an optional soft backlight effect (separate from colour) */}
                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium">{t('roleGlow')}</span>
                      <span className="block text-[12px] text-muted-foreground">{t('roleGlowHint')}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={glow != null}
                      onChange={(e) => setGlow(e.target.checked ? (glow ?? color ?? DEFAULT_ROLE_COLOR) : null)}
                      className="h-4 w-4 shrink-0 accent-link"
                    />
                  </label>
                  {glow != null && (
                    <div className="relative flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPicker((p) => (p === 'glow' ? null : 'glow'))}
                        className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-2', picker === 'glow' ? 'ring-foreground' : 'ring-border/60')}
                        style={{ backgroundColor: glow }}
                      >
                        <Pencil className="h-3.5 w-3.5 text-white" />
                      </button>
                      <span className="flex h-8 items-center rounded-lg bg-background px-3 text-[14px] font-semibold" style={{ color: color ?? '#fff', filter: `drop-shadow(0 0 4px ${glow})` }}>Aa</span>
                      {picker === 'glow' && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
                          <div className="absolute left-0 top-full z-50 mt-2">
                            <ColorPicker value={glow} onChange={setGlow} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Icon */}
                <div className="flex flex-col gap-2">
                  <Label>{t('roleIcon')}</Label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => iconRef.current?.click()}
                      className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-secondary ring-1 ring-border/50"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        : icon ? <Image src={icon} alt="" width={64} height={64} className="max-h-full max-w-full object-contain" unoptimized />
                        : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
                    </button>
                    <div className="flex flex-col gap-1">
                      <button type="button" onClick={() => iconRef.current?.click()} className="w-fit text-sm font-medium text-link hover:underline">{t('roleIconUpload')}</button>
                      <span className="text-[12px] text-muted-foreground">{t('roleIconHint')}</span>
                      {icon && <button type="button" onClick={() => setIcon(null)} className="w-fit text-sm text-muted-foreground hover:text-destructive">{t('removeImage')}</button>}
                    </div>
                    <input ref={iconRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => { pickIcon(e.target.files?.[0]); e.target.value = ''; }} />
                  </div>
                </div>

                {/* Hoist — display this role's members separately above others */}
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium">{t('roleHoist')}</span>
                    <span className="block text-[12px] text-muted-foreground">{t('roleHoistHint')}</span>
                  </span>
                  <input type="checkbox" checked={hoist} onChange={(e) => setHoist(e.target.checked)} className="h-4 w-4 shrink-0 accent-link" />
                </label>

                {/* Mentionable */}
                <div className="flex flex-col gap-2">
                  <Label>{t('roleMention')}</Label>
                  <div className="flex flex-col divide-y divide-border/30 overflow-hidden rounded-xl ring-1 ring-border/30">
                    {(['everyone', 'selected', 'none'] as MentionMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMentionMode(m)}
                        className="flex items-center justify-between gap-3 bg-card/40 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/30"
                      >
                        <span className="text-[14px]">{t(`roleMention_${m}`)}</span>
                        {mentionMode === m && <Check className="h-4 w-4 shrink-0 text-link" />}
                      </button>
                    ))}
                  </div>

                  {mentionMode === 'selected' && (
                    <div className="mt-1 flex max-h-52 flex-col gap-0.5 overflow-y-auto rounded-xl bg-card/40 p-1.5 ring-1 ring-border/30">
                      {members.length === 0 ? (
                        <p className="px-2 py-2 text-[13px] text-muted-foreground">{t('noMembers')}</p>
                      ) : members.map((mem) => (
                        <label key={mem.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-accent/40">
                          <input type="checkbox" checked={allow.has(mem.id)} onChange={() => toggleAllow(mem.id)} className="h-4 w-4 accent-link" />
                          <span className="truncate text-[13px]">{renderEmojiNodes(mem.display_name ?? mem.username)}</span>
                          <span className="truncate text-[12px] text-muted-foreground">@{mem.username}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Permissions */}
            <div className="flex flex-col gap-4">
              <Label>{t('rolePermissions')}</Label>
              {isAdmin && (
                <p className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[13px] font-medium text-warning">
                  <Shield className="h-4 w-4 shrink-0" /> {t('adminGrantsAll')}
                </p>
              )}
              {PERM_TREE.map((group) => (
                <div key={group.key} className="flex flex-col gap-1">
                  <p className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{t(`permGroup.${group.key}`)}</p>
                  <div className="flex flex-col divide-y divide-border/30 overflow-hidden rounded-xl ring-1 ring-border/30">
                    {group.nodes.map((node) => {
                      const open = expanded.has(node.key);
                      return (
                        <div key={node.key}>
                          <div className="flex items-start justify-between gap-3 bg-card/40 px-3.5 py-2.5">
                            <div className="flex min-w-0 items-start gap-2">
                              {node.children ? (
                                <button type="button" onClick={() => toggleExpand(node.key)} className="mt-0.5 text-muted-foreground transition-transform hover:text-foreground" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              ) : <span className="w-4 shrink-0" />}
                              <span className="min-w-0">
                                <span className="block text-[14px] font-medium">{t(`perm.${node.key}`)}</span>
                                {node.hasDesc && <span className="block text-[12px] text-muted-foreground">{t(`permDesc.${node.key}`)}</span>}
                              </span>
                            </div>
                            <input type="checkbox" checked={forcedBy(node) || nodeChecked(node)} disabled={forcedBy(node)} onChange={() => nodeToggle(node)} className="mt-1 h-4 w-4 shrink-0 accent-link disabled:opacity-60" />
                          </div>
                          {node.children && open && (
                            <div className="flex flex-col divide-y divide-border/20 border-t border-border/30 bg-background/40">
                              {node.children.map((child) => (
                                <label key={child.key} className="flex cursor-pointer items-center justify-between gap-3 py-2 pl-10 pr-3.5">
                                  <span className="text-[13px]">{t(`perm.${child.key}`)}</span>
                                  <input type="checkbox" checked={isAdmin || nodeChecked(child)} disabled={isAdmin} onChange={() => nodeToggle(child)} className="h-4 w-4 shrink-0 accent-link disabled:opacity-60" />
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {group.note && <p className="px-0.5 text-[11px] text-muted-foreground/60">{t(`permNote.${group.note}`)}</p>}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              {!selected.is_default ? (
                <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" /> {t('deleteRole')}
                </Button>
              ) : <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Shield className="h-4 w-4" /> {t('everyoneHint')}</span>}
              <Button size="sm" onClick={onSave} isLoading={busy} disabled={!dirty}>{t('save')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground/60">{t('selectRole')}</div>
        )}
      </div>
    </>
  );
}

/** A single row in the role list — shared by draggable roles and pinned @everyone. */
function RoleRow({ r, selected, dragging, onSelect }: {
  r: Role; selected: boolean; dragging?: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors',
        selected ? 'bg-accent' : 'hover:bg-accent/40',
        dragging && 'opacity-40',
      )}
    >
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? ROLE_FALLBACK_COLOR }} />
      <span className={cn('truncate', roleNameClass(r.color, r.color2))} style={roleNameStyle(r.color, r.color2, r.glow)}>{r.name}</span>
      {r.hoist && <Shield className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/50" />}
    </button>
  );
}
