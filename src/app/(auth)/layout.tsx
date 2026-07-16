import type { ReactNode } from 'react';
import Link from 'next/link';

import { getLocale, getT } from '@/lib/i18n';
import { LocaleToggle } from '@/components/ui';
import { site } from '@/config';

/**
 * Split auth shell: a dark brand panel on the left (hidden on small screens)
 * and the form column on the right. The whole shell is forced into `.dark` so
 * the token-based form controls render on the app's dark palette and match the
 * premium landing style.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getT('home');

  return (
    <div className="dark relative flex min-h-dvh w-full bg-background text-foreground">
      {/* ── Left brand panel ── */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-[#111111] p-10 text-white lg:flex xl:p-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 noise-layer opacity-[0.08]" />

        <Link href={site.routes.home} className="relative z-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon/prosto_logo.png" alt="" className="h-8 w-8" />
          <span className="text-[18px] font-bold tracking-tight">{site.name}</span>
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold leading-[1.1] tracking-tight xl:text-5xl">{t('heading')}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/55">{t('description')}</p>
        </div>

        <div className="relative z-10 text-[13px] text-white/30">© {new Date().getFullYear()} {site.name}</div>
      </aside>

      {/* ── Right form panel ── */}
      <main className="relative flex w-full flex-col lg:w-1/2">
        <div className="absolute right-5 top-5 z-10">
          <LocaleToggle locale={locale} />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-16 sm:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
