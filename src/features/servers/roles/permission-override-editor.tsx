'use client';

/**
 * Discord-style role permission override editor.
 *
 * Reused for channels and categories:
 *   - Left column: roles that already have an override on this target, plus
 *     a "+ role" picker of the remaining server roles.
 *   - Right column: for the selected role, a matrix of every bit-enforced
 *     permission with a tri-state control — deny / inherit / allow.
 *
 * Behaviour follows Discord:
 *   - Adding a role creates an all-neutral override (allow=0, deny=0), which
 *     is a no-op semantically but persists the role in the override list.
 *   - Any click on a channel override auto-unsyncs the channel from its
 *     category (server-side; we mirror the flag locally for the badge).
 *   - "Sync with category" (channels only, when there's a category) drops
 *     every channel-specific override and inherits from the category.
 *
 * All mutations optimistically update local state and fire the RPC in the
 * background. On failure we reload from the server to get back in sync.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Minus, X, Trash2, Link2, Link2Off, Plus, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { Button } from '@/components/ui';
import { PERM_TREE, roleNameStyle, roleNameClass, type PermNode } from './permissions';
import {
  setChannelRoleOverride, removeChannelRoleOverride,
  setCategoryRoleOverride, removeCategoryRoleOverride,
  syncChannelToCategory,
} from '../actions';

interface Role {
  id: string;
  name: string;
  color: string | null;
  color2: string | null;
  glow: string | null;
  icon_url: string | null;
  is_default: boolean;
  position: number;
}

interface OverrideRow { role_id: string; allow: number; deny: number }
interface OverrideMask { allow: number; deny: number }

type TriValue = 'deny' | 'neutral' | 'allow';

/** Extract the current tri-state for a bit given the role's allow/deny masks. */
function bitState(allow: number, deny: number, bit: number): TriValue {
  if ((deny & bit) !== 0) return 'deny';
  if ((allow & bit) !== 0) return 'allow';
  return 'neutral';
}

/** Apply a tri-state selection to an override mask pair. */
function applyBit(allow: number, deny: number, bit: number, next: TriValue): OverrideMask {
  const cleared = { allow: allow & ~bit, deny: deny & ~bit };
  if (next === 'allow') return { allow: cleared.allow | bit, deny: cleared.deny };
  if (next === 'deny')  return { allow: cleared.allow,       deny: cleared.deny | bit };
  return cleared;
}

interface Props {
  kind: 'channel' | 'category';
  targetId: string;
  serverId: string;
  /** For channels only. Whether the channel currently inherits from its category. */
  initialSynced?: boolean;
  /** For channels only. Whether the channel has a parent category (Sync button only shows when true). */
  hasCategory?: boolean;
}

export function PermissionOverrideEditor({
  kind, targetId, serverId, initialSynced = true, hasCategory = false,
}: Props) {
  const t = useT('servers');
  const [roles, setRoles] = useState<Role[]>([]);
  const [overrides, setOverrides] = useState<Map<string, OverrideMask>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [synced, setSynced] = useState(initialSynced);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    const sb = createClient();
    const [rolesRes, overridesRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc('get_server_roles', { p_server: serverId }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).rpc(
        kind === 'channel' ? 'get_channel_overrides' : 'get_category_overrides',
        kind === 'channel' ? { p_channel: targetId } : { p_category: targetId },
      ),
    ]);
    if (Array.isArray(rolesRes.data)) setRoles(rolesRes.data as Role[]);
    const map = new Map<string, OverrideMask>();
    for (const row of (Array.isArray(overridesRes.data) ? overridesRes.data : []) as OverrideRow[]) {
      map.set(row.role_id, { allow: Number(row.allow) || 0, deny: Number(row.deny) || 0 });
    }
    setOverrides(map);
    // Re-read synced_to_category so the badge is truthful after any sibling
    // action (e.g. someone edited overrides in another tab).
    if (kind === 'channel') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any).from('server_channels')
        .select('synced_to_category').eq('id', targetId).maybeSingle();
      if (data) setSynced(!!data.synced_to_category);
    }
    // Auto-select the first role that has an override if none is chosen.
    setSelected((prev) => prev ?? (map.size > 0 ? [...map.keys()][0]! : null));
  }, [kind, targetId, serverId]);

  useEffect(() => { void load(); }, [load]);

  async function persist(roleId: string, allow: number, deny: number) {
    setBusy(true);
    const fn = kind === 'channel' ? setChannelRoleOverride : setCategoryRoleOverride;
    const res = await fn(targetId, roleId, allow, deny);
    // Channel writes auto-unsync server-side; mirror locally so the badge flips.
    if (kind === 'channel' && synced) setSynced(false);
    setBusy(false);
    if ('error' in res) void load(); // resync on failure
  }

  async function onToggle(roleId: string, bit: number, next: TriValue) {
    const cur = overrides.get(roleId) ?? { allow: 0, deny: 0 };
    const nextMask = applyBit(cur.allow, cur.deny, bit, next);
    setOverrides((prev) => new Map(prev).set(roleId, nextMask));
    await persist(roleId, nextMask.allow, nextMask.deny);
  }

  async function onAddRole(roleId: string) {
    setOverrides((prev) => new Map(prev).set(roleId, { allow: 0, deny: 0 }));
    setSelected(roleId);
    setPickerOpen(false);
    await persist(roleId, 0, 0);
  }

  async function onRemoveRole(roleId: string) {
    setOverrides((prev) => { const n = new Map(prev); n.delete(roleId); return n; });
    if (selected === roleId) setSelected(null);
    setBusy(true);
    const fn = kind === 'channel' ? removeChannelRoleOverride : removeCategoryRoleOverride;
    const res = await fn(targetId, roleId);
    if (kind === 'channel' && synced) setSynced(false);
    setBusy(false);
    if ('error' in res) void load();
  }

  async function onSyncBack() {
    // Discord-style destructive prompt (single confirm — no separate modal).
    if (typeof window !== 'undefined' && !window.confirm(t('permOverride.syncConfirm'))) return;
    setBusy(true);
    const res = await syncChannelToCategory(targetId);
    setBusy(false);
    if ('error' in res) { void load(); return; }
    setSynced(true);
    await load();
  }

  // Only bit-enforced permissions are editable in overrides — the free-form
  // `extra_perms` tree items are role-level only. Also drop empty groups.
  const groups = PERM_TREE.map((g) => ({
    ...g,
    nodes: g.nodes.filter((n): n is PermNode & { bit: number } => n.bit != null),
  })).filter((g) => g.nodes.length > 0);

  const rolesWithOverride = roles.filter((r) => overrides.has(r.id));
  const rolesWithoutOverride = roles.filter((r) => !overrides.has(r.id));
  const activeMask = selected ? overrides.get(selected) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row: description + sync badge/button (channels only) */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">
          {kind === 'channel' ? t('permOverride.channelDescription') : t('permOverride.categoryDescription')}
        </p>
        {kind === 'channel' && hasCategory && (
          <div className="flex shrink-0 items-center gap-2">
            {synced ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-link/10 px-2.5 py-1 text-[11px] font-medium text-link">
                <Link2 className="h-3 w-3" /> {t('permOverride.syncedBadge')}
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
                  <Link2Off className="h-3 w-3" /> {t('permOverride.notSyncedBadge')}
                </span>
                <Button size="sm" variant="ghost" onClick={onSyncBack} disabled={busy}>
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  {t('permOverride.syncToCategory')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px,1fr]">
        {/* Left: role list */}
        <div className="flex flex-col gap-2">
          <div className="flex min-h-[64px] flex-col gap-0.5 rounded-xl bg-card/40 p-1.5 ring-1 ring-border/30">
            {rolesWithOverride.length === 0 && (
              <p className="px-3 py-4 text-center text-[12px] text-muted-foreground/70">
                {t('permOverride.noRoles')}
              </p>
            )}
            {rolesWithOverride.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'group flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors',
                  selected === r.id ? 'bg-accent' : 'hover:bg-accent/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelected(r.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {r.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.icon_url} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  ) : (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: r.color ?? 'currentColor', opacity: r.color ? 1 : 0.4 }}
                    />
                  )}
                  <span
                    className={cn('flex-1 truncate text-[13px] font-medium', roleNameClass(r.color, r.color2))}
                    style={roleNameStyle(r.color, r.color2, r.glow)}
                  >
                    {r.is_default ? '@everyone' : r.name}
                  </span>
                </button>
                <button
                  type="button"
                  title={t('permOverride.removeOverride')}
                  onClick={() => onRemoveRole(r.id)}
                  disabled={busy}
                  className="hidden text-muted-foreground/60 transition-colors hover:text-destructive group-hover:block"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add-role picker */}
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-center"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={rolesWithoutOverride.length === 0 || busy}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('permOverride.addRole')}
              <ChevronDown className={cn('ml-1 h-3.5 w-3.5 transition-transform', pickerOpen && 'rotate-180')} />
            </Button>
            {pickerOpen && (
              <div className="surface-solid absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl p-1.5 shadow-xl ring-1 ring-border/50">
                {rolesWithoutOverride.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onAddRole(r.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    {r.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.icon_url} alt="" className="h-4 w-4 shrink-0 object-contain" />
                    ) : (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: r.color ?? 'currentColor', opacity: r.color ? 1 : 0.4 }}
                      />
                    )}
                    <span
                      className={cn('truncate text-[13px] font-medium', roleNameClass(r.color, r.color2))}
                      style={roleNameStyle(r.color, r.color2, r.glow)}
                    >
                      {r.is_default ? '@everyone' : r.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: permission matrix */}
        <div className="flex flex-col gap-3">
          {!selected || !activeMask ? (
            <p className="rounded-xl bg-card/40 px-4 py-8 text-center text-[13px] text-muted-foreground ring-1 ring-border/30">
              {t('permOverride.noRoles')}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-1">
                <p className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  {t(`permGroup.${group.key}`)}
                </p>
                <div className="flex flex-col divide-y divide-border/30 overflow-hidden rounded-xl ring-1 ring-border/30">
                  {group.nodes.map((node) => {
                    const state = bitState(activeMask.allow, activeMask.deny, node.bit);
                    return (
                      <div
                        key={node.key}
                        className="flex items-center justify-between gap-3 bg-card/40 px-3.5 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium">{t(`perm.${node.key}`)}</span>
                          <span className="block text-[12px] text-muted-foreground">{t(`permDesc.${node.key}`)}</span>
                        </span>
                        <TriState
                          value={state}
                          disabled={busy}
                          onChange={(v) => onToggle(selected, node.bit, v)}
                          labels={{
                            deny: t('permOverride.deny'),
                            neutral: t('permOverride.neutral'),
                            allow: t('permOverride.allow'),
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Segmented control: deny / neutral / allow with contextual colours. */
function TriState({
  value, onChange, disabled, labels,
}: {
  value: TriValue;
  onChange: (v: TriValue) => void;
  disabled?: boolean;
  labels: { deny: string; neutral: string; allow: string };
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-border/40">
      <TriBtn
        v="deny" current={value} disabled={disabled} label={labels.deny}
        onClick={() => onChange('deny')}
        activeCls="bg-destructive/15 text-destructive"
      ><X className="h-4 w-4" /></TriBtn>
      <TriBtn
        v="neutral" current={value} disabled={disabled} label={labels.neutral}
        onClick={() => onChange('neutral')}
        activeCls="bg-muted text-foreground"
      ><Minus className="h-4 w-4" /></TriBtn>
      <TriBtn
        v="allow" current={value} disabled={disabled} label={labels.allow}
        onClick={() => onChange('allow')}
        activeCls="bg-success/15 text-success"
      ><Check className="h-4 w-4" /></TriBtn>
    </div>
  );
}

function TriBtn({
  v, current, label, onClick, disabled, activeCls, children,
}: {
  v: TriValue;
  current: TriValue;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  activeCls: string;
  children: React.ReactNode;
}) {
  const active = current === v;
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-8 items-center justify-center transition-colors',
        active ? activeCls : 'text-muted-foreground/60 hover:bg-accent/40 hover:text-foreground',
        disabled && 'opacity-60',
      )}
    >
      {children}
    </button>
  );
}
