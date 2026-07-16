'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

import { Input, Label } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { validateUsernameFormat, normalizeUsername } from '../username-rules';

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface UsernameFieldProps {
  error?: string;          // server-side error key
  defaultValue?: string;
  currentUsername?: string; // the user's existing username — excluded from availability check
}

/**
 * Username input with debounced live availability check.
 * - Format rules from username-rules.ts (client, instant)
 * - Availability via GET /api/username-check (debounced 400ms)
 * - Status shown inline: Available / Taken / format error
 */
export function UsernameField({ error, defaultValue, currentUsername }: UsernameFieldProps) {
  const t = useT('auth.fields');
  const te = useT('auth.errors');

  const [value, setValue] = useState(defaultValue ?? '');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [formatError, setFormatError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const normalized = normalizeUsername(value);

    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!normalized) {
      setCheckState('idle');
      setFormatError(null);
      return;
    }

    // Instant format check
    const format = validateUsernameFormat(normalized);
    if (!format.ok) {
      setCheckState('invalid');
      setFormatError(format.key);
      return;
    }

    setFormatError(null);

    // If the value matches the current (own) username — no need to check
    if (currentUsername && normalizeUsername(currentUsername) === normalized) {
      setCheckState('idle');
      return;
    }

    setCheckState('checking');

    // Debounced availability check — pass exclude so own username isn't flagged
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const params = new URLSearchParams({ username: normalized });
        if (currentUsername) params.set('exclude', currentUsername);
        const res = await fetch(`/api/username-check?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as { available: boolean };
        setCheckState(json.available ? 'available' : 'taken');
      } catch {
        // Aborted or network error — reset silently
        setCheckState('idle');
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value, currentUsername]);

  // Priority: server error > format error > availability
  const displayError = error ? te(error) : formatError ? te(formatError) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="username">{t('username')}</Label>

      <div className="relative">
        <Input
          id="username"
          name="username"
          autoComplete="username"
          spellCheck={false}
          placeholder={t('usernamePlaceholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(displayError || checkState === 'taken')}
          className="pr-9"
        />

        {/* Status icon */}
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {checkState === 'checking' && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {checkState === 'available' && (
            <CheckCircle className="h-4 w-4 text-success" />
          )}
          {(checkState === 'taken' || checkState === 'invalid') && (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </span>
      </div>

      {/* Feedback line */}
      {displayError ? (
        <p className="text-xs text-destructive" role="alert">{displayError}</p>
      ) : checkState === 'taken' ? (
        <p className="text-xs text-destructive" role="alert">{te('usernameTaken')}</p>
      ) : checkState === 'available' ? (
        <p className="text-xs text-success">{te('usernameAvailable')}</p>
      ) : null}
    </div>
  );
}
