'use client';

import { useCallback, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { User, UserCircle, Palette, Link2, Lock, Bell, LogOut, X, ChevronRight, ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { signOut } from '@/features/auth';
import { site } from '@/config';

/* ── Sections ── */
type Section = { key: string; href: string; icon: LucideIcon; labelKey: string };

const sections: Section[] = [
  { key: 'account',     href: '/settings',             icon: User,       labelKey: 'navAccount'     },
  { key: 'profile',     href: '/settings/profile',     icon: UserCircle, labelKey: 'navProfile'     },
  { key: 'privacy',     href: '/settings/privacy',     icon: Lock,       labelKey: 'navPrivacy'     },
  { key: 'notifications', href: '/settings/notifications', icon: Bell,   labelKey: 'navNotifications' },
  { key: 'connections', href: '/settings/connections', icon: Link2,     labelKey: 'navConnections' },
  { key: 'appearance',  href: '/settings/appearance',  icon: Palette,    labelKey: 'navAppearance'  },
];

interface SettingsShellProps {
  children: ReactNode;
}

export function SettingsShell({ children }: SettingsShellProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const tn = useT('nav');
  const ts = useT('account');
  const [, startTransition] = useTransition();

  /* Close the settings overlay: return to the previous app page, or the feed
     if settings was opened directly (no in-app history to go back to). */
  const close = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(site.routes.feed);
  }, [router]);

  /* ESC → close */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const isRoot = pathname === '/settings';
  const activeSection = sections.find((s) =>
    s.key === 'account'
      ? pathname === '/settings' || pathname === '/settings/account'
      : pathname === s.href || pathname.startsWith(s.href + '/'),
  );

  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ══ Desktop: persistent left nav (hidden on mobile) ══ */}
      <aside className="hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-border/20 bg-background/40 px-2.5 py-6 md:flex">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {tn('settings')}
        </p>

        <nav className="flex flex-1 flex-col gap-0.5">
          {sections.map((s) => {
            const active = s.key === activeSection?.key;
            return (
              <Link
                key={s.key}
                href={s.href}
                replace
                className={cn(
                  'flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors duration-fast',
                  active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <s.icon className="h-[15px] w-[15px] shrink-0" />
                <span>{ts(s.labelKey as Parameters<typeof ts>[0])}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 border-t border-border/20 pt-2">
          <form action={signOut} onSubmit={() => startTransition(() => {})}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors duration-fast hover:bg-destructive/10"
            >
              <LogOut className="h-[15px] w-[15px] shrink-0" />
              <span>{tn('signOut')}</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ══ Content column ══ */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Mobile top bar: back-to-list (in a section) or title + close (root) */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/20 px-2 pt-[env(safe-area-inset-top)] md:hidden">
          {isRoot ? (
            <>
              <span className="px-2 text-[17px] font-bold tracking-tight">{tn('settings')}</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close settings"
                className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/settings"
                replace
                aria-label={tn('settings')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <span className="truncate text-[17px] font-bold tracking-tight">
                {activeSection ? ts(activeSection.labelKey as Parameters<typeof ts>[0]) : tn('settings')}
              </span>
            </>
          )}
        </div>

        {/* Desktop close button (top-right of content) */}
        <div className="hidden shrink-0 justify-end px-3 pt-6 md:flex">
          <button
            type="button"
            onClick={close}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="pb-bottom-nav min-h-0 flex-1 overflow-y-auto">
          {/* Mobile ROOT (/settings): full-screen section list (drill-in). Each
              row navigates to its section, which then shows a back arrow. The
              account row goes to /settings/account so it drills in like the
              rest. Desktop shows the account content at /settings instead. */}
          {isRoot && (
            <nav className="flex flex-col gap-1 p-3 md:hidden">
              {sections.map((s) => {
                const href = s.key === 'account' ? '/settings/account' : s.href;
                return (
                  <Link
                    key={s.key}
                    href={href}
                    replace
                    className="flex items-center gap-3.5 rounded-2xl bg-secondary/40 px-4 py-4 text-left transition-colors active:bg-accent"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/60 text-foreground">
                      <s.icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-[15px] font-semibold">{ts(s.labelKey as Parameters<typeof ts>[0])}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                  </Link>
                );
              })}

              <form action={signOut} onSubmit={() => startTransition(() => {})} className="mt-1">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-4 text-left text-destructive transition-colors active:bg-destructive/10"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                    <LogOut className="h-5 w-5" />
                  </span>
                  <span className="flex-1 text-[15px] font-semibold">{tn('signOut')}</span>
                </button>
              </form>
            </nav>
          )}

          {/* Section content. Desktop: always shown (at /settings it's the
              account page). Mobile: shown only inside a section — at the root the
              list above replaces it. */}
          <div className={cn('px-4 py-6 md:px-8', isRoot && 'hidden md:block')}>
            <div key={pathname} className="animate-settings-in mx-auto w-full max-w-3xl">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
