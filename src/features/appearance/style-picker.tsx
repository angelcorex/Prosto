'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { usePlatformStyle, type PlatformStyle } from './platform-style';

const OPTIONS: { key: PlatformStyle; glass?: boolean }[] = [
  { key: 'default' },
  { key: 'glass', glass: true },
];

export function StylePicker() {
  const t = useT('settings');
  const { style, setStyle, mounted } = usePlatformStyle();

  return (
    <div className="grid grid-cols-2 gap-3">
      {OPTIONS.map((o) => {
        const active = mounted && style === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => setStyle(o.key)}
            className={cn(
              'group relative overflow-hidden rounded-2xl p-3 text-left ring-2 transition-all',
              active ? 'ring-link' : 'ring-transparent hover:ring-border',
            )}
          >
            {/* Mini mock preview */}
            <div className={cn('relative mb-3 flex h-24 gap-1.5 overflow-hidden rounded-xl bg-background p-1.5', o.glass && 'bg-[#0b0b10]')}>
              {/* rail */}
              <div className={cn('flex w-4 flex-col items-center gap-1 rounded-lg py-1', o.glass ? 'border border-white/12 bg-white/8 backdrop-blur-md' : 'bg-secondary')}>
                <span className="h-2.5 w-2.5 rounded-full bg-link/70" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
              </div>
              {/* content cards */}
              <div className="flex flex-1 flex-col gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-4 w-full',
                      o.glass ? 'rounded-lg border border-white/15 bg-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] backdrop-blur-md' : 'rounded-md bg-secondary',
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{t(`style_${o.key}`)}</p>
                <p className="truncate text-[12px] text-muted-foreground">{t(`styleDesc_${o.key}`)}</p>
              </div>
              {active && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-link text-white"><Check className="h-3 w-3" /></span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
