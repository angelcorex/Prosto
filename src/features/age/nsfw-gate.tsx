'use client';

import { useState, type ReactNode } from 'react';
import { Lock, Eye } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { useViewerAge } from './age-provider';

/**
 * Wraps age-restricted (18+) media. Adults see a blurred cover with a "Show"
 * reveal; under-18 (or no birth date) viewers get an opaque, non-revealable
 * lock. The child media is kept mounted but `invisible` so the cover matches
 * its size and nothing of the content is ever painted before reveal.
 */
export function NsfwGate({ children, full }: { children: ReactNode; full?: boolean }) {
  const t = useT('age');
  const { isAdult } = useViewerAge();
  const [revealed, setRevealed] = useState(false);

  if (revealed && isAdult) return <>{children}</>;

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', full ? 'block w-full' : 'inline-flex')}>
      <div className="pointer-events-none invisible select-none">{children}</div>
      {isAdult ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-secondary/95 p-4 text-center backdrop-blur-xl transition-colors hover:bg-secondary"
        >
          <Eye className="mb-0.5 h-5 w-5 text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">{t('sensitive')}</span>
          <span className="text-[12px] text-muted-foreground">{t('showSensitive')}</span>
        </button>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-secondary p-4 text-center">
          <Lock className="mb-0.5 h-5 w-5 text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">{t('restrictedTitle')}</span>
          <span className="text-[12px] text-muted-foreground">{t('restrictedBody')}</span>
        </div>
      )}
    </div>
  );
}
