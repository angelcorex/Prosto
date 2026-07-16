'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MoreHorizontal, Trash2, Plus, Check, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { AvatarImage } from '@/components/ui/avatar-image';
import { VerifiedBadge, ModeratorBadge, PremiumBadge, EmojiText } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { listAccounts, switchAccount, removeAccount } from '../api/actions';
import { MAX_ACCOUNTS } from '@/lib/accounts/constants';
import type { AccountSummary } from '../types';
import { AddAccountModal } from './add-account-modal';
import { AccountSwitchOverlay } from './account-switch-overlay';

/**
 * Manage the accounts kept on this device: click one to switch, open the
 * per-row menu to remove it, or add another. Switching / removing the active
 * account hard-reloads so the app re-initialises cleanly as the new user.
 */
export function AccountsModal({ onClose }: { onClose: () => void }) {
  const t = useT('accounts');
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function load() {
    const res = await listAccounts();
    setAccounts(res.accounts);
    setActiveId(res.activeId);
  }
  useEffect(() => { load(); }, []);

  async function onSwitch(id: string) {
    if (id === activeId || busy) return;
    setBusy(id);
    setError(null);
    setSwitching(true); // opaque overlay so the old account never flashes
    const res = await switchAccount(id);
    if (res.ok) {
      window.location.href = site.routes.home; // reload as the new account
      return;
    }
    setSwitching(false);
    setBusy(null);
    setError(res.error === 'expired' ? t('sessionExpired') : t('switchFailed'));
    await load();
  }

  async function onRemove(id: string) {
    setMenuFor(null);
    setBusy(id);
    setError(null);
    const res = await removeAccount(id);
    if ('ok' in res && res.ok) {
      if (res.switched) { setSwitching(true); window.location.href = site.routes.home; return; }
      if (res.signedOut) { setSwitching(true); window.location.href = site.routes.signIn; return; }
      await load(); // removed an inactive account — just refresh the list
    }
    setBusy(null);
  }

  const atLimit = (accounts?.length ?? 0) >= MAX_ACCOUNTS;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <h2 className="text-lg font-bold tracking-tight">{t('manageTitle')}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {accounts === null ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              accounts.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  active={a.id === activeId}
                  busy={busy === a.id}
                  menuOpen={menuFor === a.id}
                  onSwitch={() => onSwitch(a.id)}
                  onToggleMenu={() => setMenuFor((v) => (v === a.id ? null : a.id))}
                  onRemove={() => onRemove(a.id)}
                />
              ))
            )}

            {error && <p className="px-3 py-2 text-[13px] text-destructive">{error}</p>}
          </div>

          <div className="border-t border-border/50 p-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={atLimit}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary/70 py-2.5 text-[14px] font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {t('addNew')}
            </button>
            {atLimit && <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">{t('maxReached', { max: MAX_ACCOUNTS })}</p>}
          </div>
        </div>
      </div>

      {adding && <AddAccountModal onClose={() => setAdding(false)} />}
      {switching && <AccountSwitchOverlay />}
    </>,
    document.body,
  );
}

function AccountRow({
  account, active, busy, menuOpen, onSwitch, onToggleMenu, onRemove,
}: {
  account: AccountSummary;
  active: boolean;
  busy: boolean;
  menuOpen: boolean;
  onSwitch: () => void;
  onToggleMenu: () => void;
  onRemove: () => void;
}) {
  const t = useT('accounts');
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const name = account.display_name ?? account.username;
  const initial = name[0]?.toUpperCase() ?? '?';

  // Position the menu via a portal so the modal's rounded overflow / scroll
  // container can't clip it (it was getting hidden behind the list edge).
  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) { setMenuPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    const W = 176; // w-44
    const left = Math.max(8, r.right - W);
    setMenuPos({ top: r.bottom + 6 + window.scrollY, left: left + window.scrollX });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      onToggleMenu();
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [menuOpen, onToggleMenu]);

  return (
    <div className={cn('group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors', active ? 'bg-accent/50' : 'hover:bg-accent/40')}>
      <button
        type="button"
        onClick={onSwitch}
        disabled={busy}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
      >
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-link/20">
          {account.avatar_url
            ? <AvatarImage src={account.avatar_url} alt={initial} sizes="40px" className="object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-base font-bold text-link">{initial}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <EmojiText content={name} clamp className={cn('truncate text-[14px] font-semibold', account.is_premium && 'aurora-text aurora-text-glow-soft')} />
            {account.is_verified && <VerifiedBadge size="sm" />}
            {account.is_moderator && <ModeratorBadge size="sm" />}
            {account.is_premium && <PremiumBadge size="sm" />}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">@{account.username}</span>
        </span>
      </button>

      {busy ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : active ? (
        <Check className="h-4 w-4 shrink-0 text-success" />
      ) : null}

      <button
        ref={btnRef}
        type="button"
        onClick={onToggleMenu}
        aria-label={t('accountMenu')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'absolute', top: menuPos.top, left: menuPos.left, zIndex: 10001 }}
          className="surface-solid w-44 overflow-hidden rounded-xl border border-border py-1 shadow-2xl animate-fade-in"
        >
          <button
            type="button"
            onClick={onRemove}
            className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            {active ? t('logOutRemove') : t('remove')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
