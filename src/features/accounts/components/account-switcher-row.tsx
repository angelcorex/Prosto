'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, ChevronRight, Plus, Check, Loader2, Settings2 } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { AvatarImage } from '@/components/ui/avatar-image';
import { EmojiText } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { listAccounts, switchAccount } from '../api/actions';
import { AccountSwitchOverlay } from './account-switch-overlay';
import type { AccountSummary } from '../types';

/**
 * "Switch accounts" row for the profile menu. On hover it reveals a flyout with
 * the accounts on this device (Discord-style) so you can switch directly — plus
 * shortcuts to add a new account or open the full manager. The flyout is
 * portaled so the menu's rounded overflow can't clip it.
 */
export function AccountSwitcherRow({
  onManage,
  onAdd,
  onClosePopup,
}: {
  onManage: () => void;
  onAdd: () => void;
  onClosePopup?: () => void;
}) {
  const t = useT('accounts');
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  function openNow() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
    if (!loadedRef.current) {
      loadedRef.current = true;
      listAccounts().then((r) => { setAccounts(r.accounts); setActiveId(r.activeId); }).catch(() => setAccounts([]));
    }
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  useLayoutEffect(() => {
    if (!open || !rowRef.current) return;
    const r = rowRef.current.getBoundingClientRect();
    const W = 264;
    const h = flyRef.current?.offsetHeight ?? 0;
    let left = r.right + 8;
    if (left + W > window.innerWidth - 8) left = r.left - W - 8; // flip to the left
    left = Math.max(8, left);
    let top = r.top;
    if (h && top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - h);
    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, [open, accounts]);

  async function onSwitch(id: string) {
    if (id === activeId || busy) return;
    setBusy(id);
    setSwitching(true); // opaque overlay so the old account never flashes
    const res = await switchAccount(id);
    if (res.ok) { window.location.href = site.routes.home; return; }
    setSwitching(false);
    setBusy(null);
  }

  return (
    <div ref={rowRef} onMouseEnter={openNow} onMouseLeave={scheduleClose} className="relative">
      {switching && <AccountSwitchOverlay />}
      <button
        type="button"
        onClick={openNow}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-[14px] font-medium text-foreground transition-colors duration-fast hover:bg-accent/60"
      >
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left">{t('switchAccounts')}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={flyRef}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: pos?.top ?? -9999, left: pos?.left ?? -9999, zIndex: 10001, width: 264, visibility: pos ? 'visible' : 'hidden' }}
          className="overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-2xl animate-fade-in"
        >
          {accounts === null ? (
            <div className="flex justify-center py-5"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex max-h-[280px] flex-col overflow-y-auto">
              {accounts.map((a) => {
                const name = a.display_name ?? a.username;
                const initial = name[0]?.toUpperCase() ?? '?';
                const isActive = a.id === activeId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSwitch(a.id)}
                    disabled={busy === a.id || isActive}
                    className={cn('flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors', isActive ? 'bg-accent/40' : 'hover:bg-accent/50')}
                  >
                    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-link/20">
                      {a.avatar_url
                        ? <AvatarImage src={a.avatar_url} alt={initial} sizes="32px" className="object-cover" />
                        : <span className="flex h-full w-full items-center justify-center text-[13px] font-bold text-link">{initial}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <EmojiText content={name} clamp className={cn('block truncate text-[13px] font-semibold', a.is_premium && 'aurora-text aurora-text-glow-soft')} />
                      <span className="block truncate text-[11px] text-muted-foreground">@{a.username}</span>
                    </span>
                    {busy === a.id
                      ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      : isActive ? <Check className="h-4 w-4 shrink-0 text-success" /> : null}
                  </button>
                );
              })}
            </div>
          )}

          <div className="my-1 h-px bg-border/50" />
          <button
            type="button"
            onClick={() => { setOpen(false); onClosePopup?.(); onAdd(); }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/50"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            {t('addNew')}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onClosePopup?.(); onManage(); }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/50"
          >
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            {t('manageTitle')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
