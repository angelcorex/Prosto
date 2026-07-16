'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';

/** Ordered list of doc pages — the sidebar and prev/next navigation. */
export const DOC_PAGES = [
  { slug: '',              key: 'introduction' },
  { slug: 'quickstart',    key: 'quickstart' },
  { slug: 'authentication', key: 'authentication' },
  { slug: 'bots',          key: 'botsTokens' },
  { slug: 'commands',      key: 'slashCommands' },
  { slug: 'interactions',  key: 'interactions' },
  { slug: 'messages',      key: 'sendingMessages' },
  { slug: 'sdk',           key: 'sdkReference' },
  { slug: 'rate-limits',   key: 'rateLimits' },
  { slug: 'security',      key: 'security' },
  { slug: 'errors',        key: 'errors' },
] as const;

function href(slug: string) {
  return slug ? `/developers/docs/${slug}` : '/developers/docs';
}

/** Categorized docs chrome: a sticky left nav + a readable content column. */
export function DocsLayout({ children }: { children: ReactNode }) {
  const t = useT('developers');
  const pathname = usePathname();

  const activePage = DOC_PAGES.find((p) => pathname === href(p.slug));

  return (
    <div className="flex flex-col md:flex-row md:gap-8">
      {/* Mobile page picker — the desktop sidebar is hidden < md, so on phones
          the docs are navigated through this collapsible dropdown instead. */}
      <details className="group mb-4 w-full rounded-xl border border-border/40 bg-card/60 md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">{t('docsNavHeading')}: </span>
            {activePage ? t(`docs.${activePage.key}.navLabel`) : t(`docs.${DOC_PAGES[0]!.key}.navLabel`)}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <nav className="max-h-[60vh] space-y-0.5 overflow-y-auto border-t border-border/30 p-2">
          {DOC_PAGES.map((p) => {
            const active = pathname === href(p.slug);
            return (
              <Link
                key={p.slug}
                href={href(p.slug)}
                className={cn(
                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {t(`docs.${p.key}.navLabel`)}
              </Link>
            );
          })}
        </nav>
      </details>

      <nav className="hidden w-52 shrink-0 md:block">
        <div className="sticky top-7 space-y-0.5">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('docsNavHeading')}
          </p>
          {DOC_PAGES.map((p) => {
            const active = pathname === href(p.slug);
            return (
              <Link
                key={p.slug}
                href={href(p.slug)}
                className={cn(
                  'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {t(`docs.${p.key}.navLabel`)}
              </Link>
            );
          })}
        </div>
      </nav>
      <article className="prose-docs min-w-0 flex-1">{children}</article>
    </div>
  );
}

/** Prev/next footer links, computed from DOC_PAGES order. */
export function DocsPager({ slug }: { slug: string }) {
  const t = useT('developers');
  const idx = DOC_PAGES.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? DOC_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < DOC_PAGES.length - 1 ? DOC_PAGES[idx + 1] : null;

  return (
    <div className="mt-10 flex justify-between gap-4 border-t border-border/40 pt-6">
      {prev ? (
        <Link href={href(prev.slug)} className="text-sm text-muted-foreground hover:text-foreground">
          ← {t(`docs.${prev.key}.navLabel`)}
        </Link>
      ) : <span />}
      {next ? (
        <Link href={href(next.slug)} className="text-right text-sm text-muted-foreground hover:text-foreground">
          {t(`docs.${next.key}.navLabel`)} →
        </Link>
      ) : <span />}
    </div>
  );
}
