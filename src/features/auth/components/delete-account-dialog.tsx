'use client';

import { useActionState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';
import { Button, Label, PasswordInput } from '@/components/ui';
import { deleteAccount } from '../api/actions';
import { initialAuthState } from '../types';

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const t = useT('account');
  const te = useT('auth.errors');
  const [state, formAction, isPending] = useActionState(deleteAccount, initialAuthState);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isPending]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          aria-label={t('cancel')}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>

        <h2 className="mt-4 text-lg font-bold tracking-tight">{t('deleteTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('deleteWarning')}</p>

        <form action={formAction} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delete-password">{t('confirmPassword')}</Label>
            <PasswordInput
              id="delete-password"
              name="password"
              autoComplete="current-password"
              aria-invalid={Boolean(state.fieldErrors?.password)}
            />
            {state.fieldErrors?.password ? (
              <p className="text-xs text-destructive" role="alert">
                {te(state.fieldErrors.password)}
              </p>
            ) : null}
            {state.formError ? (
              <p className="text-xs text-destructive" role="alert">{state.formError}</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="destructive" size="md" isLoading={isPending}>
              {t('deleteConfirm')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
