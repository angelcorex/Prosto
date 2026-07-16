'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';
import { Button } from '@/components/ui';
import { MIN_SIGNUP_AGE, maxBirthDateFor, ageFromBirthDate } from '@/lib/utils/age';
import { setBirthDate } from './actions';
import { DatePicker } from './date-picker';

/**
 * Profile birth-date field. Once a birth date is stored it's shown read-only
 * (write-once — can't be changed). If it's not set yet, the user can set it
 * here exactly once (same as the one-time prompt).
 */
export function BirthDateField({ initial }: { initial: string | null }) {
  const t = useT('age');
  const router = useRouter();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initial) {
    const d = new Date(initial);
    const label = Number.isNaN(d.getTime()) ? initial : d.toLocaleDateString();
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-input bg-muted/40 px-3.5 py-3">
        <span className="text-sm text-foreground">{label}</span>
        <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />{t('immutableNote')}
        </span>
      </div>
    );
  }

  async function save() {
    setError(null);
    if (!value) { setError('invalid'); return; }
    const age = ageFromBirthDate(value);
    if (age == null || age < MIN_SIGNUP_AGE) { setError('tooYoung'); return; }
    setBusy(true);
    const res = await setBirthDate(value);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <DatePicker value={value || null} max={maxBirthDateFor(MIN_SIGNUP_AGE)} onChange={(v) => { setValue(v); setError(null); }} />
        </div>
        <Button size="sm" onClick={save} isLoading={busy} className="shrink-0 px-5">{t('save')}</Button>
      </div>
      <p className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {error ? t(`err_${error}`) : t('immutableNote')}
      </p>
    </div>
  );
}
