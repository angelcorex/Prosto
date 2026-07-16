'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { ROLE_FALLBACK_COLOR } from './permissions';
import { setMemberRoles } from '../actions';

interface RoleOption { id: string; name: string; color: string | null; is_default: boolean }

/** Compact per-member role assigner: a dropdown of the server's roles. */
export function MemberRoles({ serverId, memberId, roles }: { serverId: string; memberId: string; roles: RoleOption[] }) {
  const t = useT('servers');
  const sbRef = useRef(createClient());
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const assignable = roles.filter((r) => !r.is_default);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('get_member_role_ids', { p_server: serverId, p_member: memberId })
      .then(({ data }: { data: { role_id: string }[] | null }) => {
        if (active && Array.isArray(data)) setIds(new Set(data.map((r) => r.role_id)));
      });
    return () => { active = false; };
  }, [serverId, memberId]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  async function toggle(roleId: string) {
    const next = new Set(ids);
    if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
    setIds(next);
    await setMemberRoles(serverId, memberId, [...next]);
    window.dispatchEvent(new CustomEvent('server:changed'));
  }

  const current = assignable.filter((r) => ids.has(r.id));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-secondary/60 px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent"
      >
        {current.length > 0 ? (
          <span className="flex items-center gap-1">
            {current.slice(0, 3).map((r) => (
              <span key={r.id} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color ?? ROLE_FALLBACK_COLOR }} />
            ))}
            <span>{current.length} {t('rolesWord')}</span>
          </span>
        ) : (
          <span>{t('addRole')}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="surface-solid absolute right-0 top-9 z-50 max-h-64 w-56 overflow-y-auto rounded-xl p-1.5 shadow-2xl ring-1 ring-border/40">
          {assignable.length === 0 ? (
            <p className="px-2 py-2 text-[13px] text-muted-foreground">{t('noRoles')}</p>
          ) : assignable.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-accent/50">
              <input type="checkbox" checked={ids.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-link" />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? ROLE_FALLBACK_COLOR }} />
              <span className={cn('truncate text-[13px]')} style={{ color: r.color ?? undefined }}>{r.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
