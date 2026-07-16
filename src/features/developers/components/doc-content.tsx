import type { ReactNode } from 'react';

/**
 * Small typographic primitives for the docs pages, so every page has consistent
 * spacing/among headings, paragraphs, lists and callouts without pulling in a
 * markdown/prose dependency. Theme-aware via design tokens.
 */

export function DocTitle({ children, eyebrow }: { children: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>}
      <h1 className="text-3xl font-bold tracking-tight">{children}</h1>
    </header>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mb-6 text-lg text-muted-foreground">{children}</p>;
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-10 text-xl font-semibold tracking-tight">{children}</h2>;
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-6 text-base font-semibold">{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 leading-relaxed text-foreground/90">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-4 ml-5 list-disc space-y-1.5 text-foreground/90 [&>li]:leading-relaxed">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-foreground/90 [&>li]:leading-relaxed">{children}</ol>;
}

/** Inline code token. */
export function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>;
}

export function Callout({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' }) {
  const tones = {
    info: 'border-primary/30 bg-primary/5',
    warn: 'border-amber-500/30 bg-amber-500/5',
    danger: 'border-destructive/30 bg-destructive/5',
  };
  return (
    <div className={`my-5 rounded-lg border p-4 text-sm leading-relaxed ${tones[tone]}`}>{children}</div>
  );
}

/** HTTP method + path header for an endpoint reference. */
export function Endpoint({ method, path }: { method: string; path: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-sky-500/15 text-sky-500',
    POST: 'bg-green-500/15 text-green-500',
    PUT: 'bg-amber-500/15 text-amber-500',
    DELETE: 'bg-destructive/15 text-destructive',
  };
  return (
    <div className="my-4 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <span className={`rounded px-2 py-0.5 text-xs font-bold ${colors[method] ?? 'bg-muted'}`}>{method}</span>
      <code className="font-mono text-sm">{path}</code>
    </div>
  );
}

/** Parameter / field table for request & response shapes. */
export function FieldTable({ rows }: { rows: { name: string; type: string; desc: string }[] }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="px-3 py-2 font-mono text-xs">{r.name}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.type}</td>
              <td className="px-3 py-2 text-foreground/90">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
