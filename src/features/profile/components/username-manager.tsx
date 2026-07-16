'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2, Plus, X, Sparkles, AtSign } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { Label } from '@/components/ui';
import { validateUsernameFormat, normalizeUsername } from '@/features/auth/username-rules';
import { addUsername, removeUsername } from '../api/usernames';

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export interface UsernameManagerProps {
  /** The user's canonical username (always shown first, not removable here). */
  primaryUsername: string;
  /** Additional usernames already claimed. */
  initialUsernames: string[];
  /** Total handles allowed (primary + extras). */
  maxTotal: number;
  /** Super Prosto subscriber — gates the whole feature. */
  isPremium: boolean;
}

/**
 * Manage additional usernames (Telegram-style handle aliases). Free users see
 * an upsell; Super Prosto subscribers can claim up to `maxTotal - 1` extras.
 * All writes go through the addUsername/removeUsername server actions, which
 * wrap the security-definer RPCs.
 */
export function UsernameManager({
  primaryUsername,
  initialUsernames,
  maxTotal,
  isPremium,
}: UsernameManagerProps) {
  const t = useT('settings.usernames');
  const te = useT('settings.usernames.errors');
  // Live format errors reuse the shared auth.errors keys (usernameInvalidChars,
  // usernameTooShort, …); action errors use settings.usernames.errors.
  const tauth = useT('auth.errors');

  const [usernames, setUsernames] = useState<string[]>(initialUsernames);
  const [value, setValue] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Extra usernames used out of the allowed budget (primary doesn't count).
  const usedExtras = usernames.length;
  const maxExtras = Math.max(0, maxTotal - 1);
  const atLimit = usedExtras >= maxExtras;

  // Debounced availability check (mirrors UsernameField).
  useEffect(() => {
    const normalized = normalizeUsername(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!normalized) {
      setCheckState('idle');
      setFormError(null);
      return;
    }

    const format = validateUsernameFormat(normalized);
    if (!format.ok) {
      setCheckState('invalid');
      setFormError(format.key);
      return;
    }
    setFormError(null);

    // Already one of the user's own handles.
    if (normalized === normalizeUsername(primaryUsername) || usernames.includes(normalized)) {
      setCheckState('taken');
      return;
    }

    setCheckState('checking');
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/username-check?username=${encodeURIComponent(normalized)}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as { available: boolean };
        setCheckState(json.available ? 'available' : 'taken');
      } catch {
        setCheckState('idle');
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value, usernames, primaryUsername]);

  function handleAdd() {
    const normalized = normalizeUsername(value);
    if (checkState !== 'available' || atLimit) return;
    startTransition(async () => {
      const res = await addUsername(normalized);
      if (res.ok) {
        setUsernames((prev) => [...prev, normalized]);
        setValue('');
        setCheckState('idle');
      } else {
        setFormError(res.error ?? 'generic');
        setCheckState('taken');
      }
    });
  }

  function handleRemove(username: string) {
    startTransition(async () => {
      const res = await removeUsername(username);
      if (res.ok) setUsernames((prev) => prev.filter((u) => u !== username));
    });
  }

  const displayError = formError
    ? (formError.startsWith('username')
        ? tauth(formError as Parameters<typeof tauth>[0])
        : te(formError as Parameters<typeof te>[0]))
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>{t('label')}</Label>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </div>

      {/* Primary + extra handles */}
      <ul className="flex flex-col gap-1.5">
        <li className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 text-sm">
          <AtSign className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{primaryUsername}</span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t('primary')}
          </span>
        </li>
        {usernames.map((u) => (
          <li key={u} className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 text-sm">
            <AtSign className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{u}</span>
            <button
              type="button"
              onClick={() => handleRemove(u)}
              disabled={isPending}
              aria-label={t('remove')}
              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {!isPremium ? (
        /* Free users: upsell — the feature is Super Prosto only. */
        <Link
          href={site.routes.super}
          className="flex items-center gap-2 rounded-lg bg-foreground/[0.04] px-3 py-3 text-sm transition-colors hover:bg-foreground/[0.07]"
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0 text-[#b3a8ff]" />
          <span className="text-muted-foreground">{t('premiumNote')}</span>
        </Link>
      ) : atLimit ? (
        <p className="text-xs text-muted-foreground">{t('limitReached', { max: maxTotal })}</p>
      ) : (
        /* Add-a-username row */
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                spellCheck={false}
                autoComplete="off"
                placeholder={t('addPlaceholder')}
                aria-invalid={checkState === 'taken' || checkState === 'invalid'}
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3.5 py-3 pr-9 text-sm text-foreground outline-none transition-colors focus:border-ring"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkState === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {checkState === 'available' && <CheckCircle className="h-4 w-4 text-success" />}
                {(checkState === 'taken' || checkState === 'invalid') && <XCircle className="h-4 w-4 text-destructive" />}
              </span>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={checkState !== 'available' || isPending}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground',
                'transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              <Plus className="h-4 w-4" />
              {t('add')}
            </button>
          </div>
          {displayError ? (
            <p className="text-xs text-destructive" role="alert">{displayError}</p>
          ) : checkState === 'available' ? (
            <p className="text-xs text-success">{t('available')}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('countLeft', { count: maxExtras - usedExtras })}</p>
          )}
        </div>
      )}
    </div>
  );
}
