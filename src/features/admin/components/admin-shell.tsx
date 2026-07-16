'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Users, Terminal, Server, ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { LocaleToggle, ThemeToggle } from '@/components/ui';

type NavItem = { href: string; icon: LucideIcon; labelKey: string; exact?: boolean };

const NAV: NavItem[] = [
  { href: '/admin',        icon: Compass,  labelKey: 'navDashboard', exact: true },
  { href: '/admin/users',  icon: Users,    labelKey: 'navUsers' },
  { href: '/admin/logs',   icon: Terminal, labelKey: 'navLogs' },
  { href: '/admin/system', icon: Server,   labelKey: 'navSystem' },
];

/**
 * Dark "operator console" chrome for the admin route group — a left rail plus a
 * scrollable content column. Intentionally distinct from the app shell so it's
 * obvious you've stepped into a privileged area.
 */
export function AdminShell({ children, locale }: { children: ReactNode; locale: string }) {
  const t = useT('admin');
  const pathname = usePathname();
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* ── Desktop left rail (md+) — hidden on phones, replaced by bottom nav ── */}
      <aside className="hidden shrink-0 flex-col border-r border-border/20 bg-background/60 py-5 md:flex md:w-[240px] md:px-3">
        <div className="mb-6 flex items-center gap-2.5 px-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon/prosto_logo.png" alt={site.name} className="h-8 w-8 shrink-0" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{t('title')}</span>
            <span className="truncate text-[11px] text-muted-foreground">{site.name}</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
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

        {/* Language + theme — same controls as the rest of the app, so the
            admin panel is fully localizable and theme-aware on its own. */}
        <div className="mt-2 flex items-center gap-2 border-t border-border/20 px-1 pt-3">
          <LocaleToggle locale={locale} up alignLeft />
          <ThemeToggle />
        </div>

        <Link
          href={site.routes.feed}
          className="mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
          <span>{t('backToApp')}</span>
        </Link>
      </aside>

      {/* ── Content ── extra bottom padding on mobile clears the bottom nav ── */}
      <main className="min-w-0 flex-1 overflow-y-auto px-5 py-6 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:px-9 md:py-7 md:pb-7">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      {/* ── Mobile bottom nav (mirrors the app's floating tab bar) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 md:hidden" aria-label={t('title')}>
        <div className="flex w-full max-w-md items-center justify-around gap-1 rounded-[26px] border border-border/40 bg-background/85 px-2 py-1.5 shadow-[0_6px_24px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-medium transition-colors',
                isActive(item) ? 'text-link' : 'text-muted-foreground',
              )}
            >
              <item.icon className="h-[22px] w-[22px] shrink-0" />
              <span className="truncate">{t(item.labelKey)}</span>
            </Link>
          ))}
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
