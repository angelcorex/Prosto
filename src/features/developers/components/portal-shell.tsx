'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Terminal, FileText, ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { LocaleToggle, ThemeToggle } from '@/components/ui';

type NavItem = { href: string; icon: LucideIcon; labelKey: string; exact?: boolean };

const NAV_BOTS: NavItem = { href: '/developers', icon: Terminal, labelKey: 'navBots', exact: true };
const NAV_DOCS: NavItem = { href: '/developers/docs', icon: FileText, labelKey: 'navDocs' };

/**
 * Developer-portal chrome — a left rail + scrollable content column, styled
 * like the admin console so it's clearly a separate operator surface. Fully
 * localizable + theme-aware on its own (same toggles as the app).
 *
 * The docs are public, so when a visitor is signed OUT we hide "My bots" (it
 * would just bounce to sign-in) and show a "Sign in" link instead of "Back to
 * app". Docs stay fully readable either way.
 */
export function PortalShell({ children, locale, authed = true }: { children: ReactNode; locale: string; authed?: boolean }) {
  const t = useT('developers');
  const pathname = usePathname();
  const nav = authed ? [NAV_BOTS, NAV_DOCS] : [NAV_DOCS];
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* ── Desktop left rail (md+) — hidden on phones, replaced by bottom nav ── */}
      <aside className="hidden shrink-0 flex-col border-r border-border/20 bg-background/60 py-5 md:flex md:w-[240px] md:px-3">
        <Link href={authed ? '/developers' : '/developers/docs'} className="mb-6 flex items-center gap-2.5 px-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon/prosto_logo.png" alt={site.name} className="h-8 w-8 shrink-0" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{t('title')}</span>
            <span className="truncate text-[11px] text-muted-foreground">{site.name}</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive(item) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span>{t(item.labelKey)}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-2 flex items-center gap-2 border-t border-border/20 px-1 pt-3">
          <LocaleToggle locale={locale} up alignLeft />
          <ThemeToggle />
        </div>

        <Link
          href={authed ? site.routes.feed : `${site.routes.signIn}?next=/developers`}
          className="mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
          <span>{authed ? t('backToApp') : t('signInCta')}</span>
        </Link>
      </aside>

      {/* ── Content ── extra bottom padding on mobile clears the bottom nav ── */}
      <main className="min-w-0 flex-1 overflow-y-auto px-5 py-6 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:px-9 md:py-7 md:pb-7">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </main>

      {/* ── Mobile bottom nav (mirrors the app's floating tab bar) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 md:hidden" aria-label={t('title')}>
        <div className="flex w-full max-w-md items-center justify-around gap-1 rounded-[26px] border border-border/40 bg-background/85 px-2 py-1.5 shadow-[0_6px_24px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition-colors',
                isActive(item) ? 'text-link' : 'text-muted-foreground',
              )}
            >
              <item.icon className="h-[22px] w-[22px] shrink-0" />
              <span className="truncate">{t(item.labelKey)}</span>
            </Link>
          ))}
          <Link
            href={authed ? site.routes.feed : `${site.routes.signIn}?next=/developers`}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            <ArrowLeft className="h-[22px] w-[22px] shrink-0" />
            <span className="truncate">{authed ? t('backToApp') : t('signInCta')}</span>
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
