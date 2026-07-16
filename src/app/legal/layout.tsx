import type { ReactNode } from 'react';
import Link from 'next/link';

import { getLocale, getT } from '@/lib/i18n';
import { site } from '@/config';
import { ThemeToggle, LocaleToggle } from '@/components/ui';

export default async function LegalLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getT('legal');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-sticky border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
          <Link href={site.routes.home} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon/prosto_logo.png" alt="" className="h-6 w-6" />
            <span className="text-sm font-semibold tracking-widest text-muted-foreground">
              {site.name.toUpperCase()}
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href={site.routes.home}
              className="mr-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('backHome')}
            </Link>
            <LocaleToggle locale={locale} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="px-4 py-12">{children}</main>
    </div>
  );
}
