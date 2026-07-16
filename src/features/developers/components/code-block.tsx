'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

export interface CodeSample {
  label: string;
  language: string;
  code: string;
}

/**
 * Documentation code block with optional language tabs (e.g. cURL / TypeScript)
 * and a copy button. Zero syntax-highlighting deps — monospace + a subtle
 * surface, which reads cleanly for API docs and stays theme-aware.
 */
export function CodeBlock({ samples, className }: { samples: CodeSample[]; className?: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = samples[active] ?? samples[0];

  async function copy() {
    try {
      await navigator.clipboard.writeText(current!.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/60 bg-[#0d1117] text-[#e6edf3]', className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-2">
        <div className="flex">
          {samples.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setActive(i)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                i === active ? 'text-white' : 'text-white/50 hover:text-white/80',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 px-3 py-2 text-xs text-white/60 transition-colors hover:text-white">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono">{current!.code}</code>
      </pre>
    </div>
  );
}

/** Inline single-language code block (no tabs). */
export function Code({ code, language = 'text' }: { code: string; language?: string }) {
  return <CodeBlock samples={[{ label: language, language, code }]} />;
}
