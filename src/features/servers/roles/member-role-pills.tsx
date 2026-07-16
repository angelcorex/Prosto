'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Check } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { roleNameStyle, roleNameClass, ROLE_FALLBACK_COLOR } from './permissions';
import { setMemberRoles } from '../actions';

interface Role {
  id: string; name: string; color: string | null; color2: string | null;
  glow: string | null; icon_url: string | null; is_default: boolean;
}

/**
 * Role pills shown inside a member's profile popup on a server. If the viewer
 * has MANAGE_ROLES they can remove a role (×) or add one via the + menu —
 * just like Discord's profile role list.
 */
export function MemberRolePills({ serverId, memberId }: { serverId: string; memberId: string }) {
  const t = useT('servers');
  const sbRef = useRef(createClient());
  const [roles, setRoles] = useState<Role[]>([]);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [canManage, setCanManage] = useState(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sb = sbRef.current;
    let active = true;
    (async () => {
      const [permRes, rolesRes, idsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any).rpc('has_perm', { p_server: serverId, p_bit: 2 }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any).rpc('get_server_roles', { p_server: serverId }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any).rpc('get_member_role_ids', { p_server: serverId, p_member: memberId }),
      ]);
      if (!active) return;
      setCanManage(permRes.data === true);
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data.filter((r: Role) => !r.is_default) : []);
      if (Array.isArray(idsRes.data)) setIds(new Set(idsRes.data.map((r: { role_id: string }) => r.role_id)));
      setReady(true);
    })();
    return () => { active = false; };
  }, [serverId, memberId]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || addBtnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  // Position the portal menu below the + button (flip up if it'd overflow the
  // viewport). Runs before paint so it never flashes at the wrong spot; the
  // portal escapes the profile card's `overflow-hidden` so it's never clipped.
  useLayoutEffect(() => {
    if (!open || !addBtnRef.current) return;
    const place = () => {
      const btn = addBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menuW = 208; // w-52
      const menuH = menuRef.current?.offsetHeight ?? 224; // max-h-56
      const margin = 8;
      let left = r.left;
      if (left + menuW > window.innerWidth - margin) left = window.innerWidth - margin - menuW;
      if (left < margin) left = margin;
      let top = r.bottom + 6;
      if (top + menuH > window.innerHeight - margin) top = r.top - menuH - 6;
      setMenuPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Recompute from scratch on next open (avoids a stale first-frame position).
  useEffect(() => { if (!open) setMenuPos(null); }, [open]);

  async function toggle(roleId: string) {
    const next = new Set(ids);
    if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
    setIds(next);
    await setMemberRoles(serverId, memberId, [...next]);
    window.dispatchEvent(new CustomEvent('server:changed'));
  }

  const assigned = roles.filter((r) => ids.has(r.id));
  if (!ready) return null;
  // Nothing to show: no roles assigned and the viewer can't add any.
  if (assigned.length === 0 && !canManage) return null;

  return (
    <div className="mx-4 mb-3 mt-1">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{t('rolesTitle')}</p>
      <div className="relative flex flex-wrap items-center gap-1.5">
        {assigned.map((r) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary/70 py-1 pl-2 pr-1.5 text-[12px] ring-1 ring-border/40"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color ?? ROLE_FALLBACK_COLOR }} />
            <span className={cn(roleNameClass(r.color, r.color2))} style={roleNameStyle(r.color, r.color2, r.glow)}>{r.name}</span>
            {canManage && (
              <button
                type="button"
                onClick={() => toggle(r.id)}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t('removeRole')}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {canManage && (
          <>
            <button
              ref={addBtnRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary/70 text-muted-foreground ring-1 ring-border/40 transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t('addRole')}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            {/* Rendered in a portal so the profile card's `overflow-hidden`
                can't clip it — the menu floats above the whole popup. */}
            {open && typeof document !== 'undefined' && createPortal(
              <div
                ref={menuRef}
                style={{ position: 'fixed', top: menuPos?.top ?? -9999, left: menuPos?.left ?? -9999, visibility: menuPos ? 'visible' : 'hidden' }}
                className="surface-solid z-[9999] max-h-56 w-52 overflow-y-auto rounded-xl p-1.5 shadow-2xl ring-1 ring-border/40"
              >
                {roles.length === 0 ? (
                  <p className="px-2 py-2 text-[13px] text-muted-foreground">{t('noRoles')}</p>
                ) : roles.map((r) => {
                  const on = ids.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggle(r.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? ROLE_FALLBACK_COLOR }} />
                      <span className="min-w-0 flex-1 truncate text-[13px]" style={roleNameStyle(r.color, r.color2)}>{r.name}</span>
                      {on && <Check className="h-3.5 w-3.5 shrink-0 text-link" />}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )}
          </>
        )}
      </div>
    </div>
  );
}
