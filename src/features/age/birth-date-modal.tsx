'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';
import { Button } from '@/components/ui';
import { MIN_SIGNUP_AGE, maxBirthDateFor, ageFromBirthDate } from '@/lib/utils/age';
import { setBirthDate } from './actions';
import { useViewerAge } from './age-provider';
import { DatePicker } from './date-picker';

/**
 * Mandatory birth-date gate for legacy accounts that never provided one.
 * Blocks the entire app (opaque, non-dismissible overlay) until a valid birth
 * date is set — write-once. New accounts capture it at sign-up, so this only
 * appears for members from before the feature existed.
 */
export function BirthDateModal() {
  const t = useT('age');
  const router = useRouter();
  const { hasBirthDate } = useViewerAge();

  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Lock page scroll while the gate is up.
  useEffect(() => {
    if (!mounted || hasBirthDate) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mounted, hasBirthDate]);

  if (!mounted || hasBirthDate) return null;

  const maxDate = maxBirthDateFor(MIN_SIGNUP_AGE);

  async function save() {
    setError(null);
    if (!value) { setError('invalid'); return; }
    const age = ageFromBirthDate(value);
    if (age == null || age < MIN_SIGNUP_AGE) { setError('tooYoung'); return; }
    setBusy(true);
    const res = await setBirthDate(value);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    router.refresh(); // re-runs the layout → hasBirthDate flips → gate unmounts
  }

  return createPortal(
    // Opaque backdrop + top z-index: nothing behind it is reachable.
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[340px] rounded-2xl border border-border/40 bg-card p-5 shadow-2xl">
        <div className="flex items-center gap-2 text-foreground">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[15px] font-semibold">{t('title')}</h2>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{t('description')}</p>

        <div className="mt-3">
          <DatePicker value={value || null} max={maxDate} onChange={(v) => { setValue(v); setError(null); }} />
        </div>

        {error && <p className="mt-2 text-[12px] text-destructive" role="alert">{t(`err_${error}`)}</p>}

        <Button size="sm" className="mt-4 w-full" onClick={save} isLoading={busy}>{t('save')}</Button>
      </div>
    </div>,
    document.body,
  );
}
