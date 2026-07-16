'use client';

import { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';

const ITEMS: { syntax: string; key: string }[] = [
  { syntax: '**bold**',        key: 'fmtBold' },
  { syntax: '*italic*',        key: 'fmtItalic' },
  { syntax: '__underline__',   key: 'fmtUnderline' },
  { syntax: '~~strike~~',      key: 'fmtStrike' },
  { syntax: '||spoiler||',     key: 'fmtSpoiler' },
  { syntax: '`code`',          key: 'fmtCode' },
  { syntax: '```js … ```',     key: 'fmtCodeblock' },
  { syntax: '# / ## / ###',    key: 'fmtHeading' },
  { syntax: '-# subtext',      key: 'fmtSubtext' },
  { syntax: '> quote',         key: 'fmtQuote' },
  { syntax: '[text](url)',     key: 'fmtLink' },
  { syntax: '[c=red]text[/c]', key: 'fmtColor' },
];

export function FormattingHelp() {
  const t = useT('messages');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('fmtTitle')}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-[280px] overflow-hidden rounded-2xl bg-card p-3 shadow-2xl ring-1 ring-border/40">
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">{t('fmtTitle')}</p>
          <div className="flex flex-col gap-1">
            {ITEMS.map((it) => (
              <div key={it.key} className="flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                <code className="shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[12px] text-foreground/80">{it.syntax}</code>
                <span className="truncate text-right text-[12px] text-muted-foreground">{t(it.key as Parameters<typeof t>[0])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
