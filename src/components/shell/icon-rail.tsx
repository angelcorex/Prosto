'use client';

import Link from 'next/link';
import { AvatarImage } from '@/components/ui/avatar-image';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Users, House, MessagesSquare } from 'lucide-react';

import { cn }   from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { useUnreadDMs } from '@/features/notifications';
import { ServerRail } from '@/features/servers';

const navItems = [
  { key: 'search', icon: Search, href: site.routes.search },
] as const;

export function IconRail({ myUsername }: { myUsername?: string | null }) {
  const t        = useT('nav');
  const tm       = useT('messages');
  const pathname = usePathname();
  const router   = useRouter();
  const unreadDMs = useUnreadDMs();
  const totalDMs = unreadDMs.reduce((s, d) => s + (d.count ?? 0), 0);

  return (
    <nav className="flex h-full w-full flex-col items-center py-4">

      {/* Wordmark — app logo */}
      <Link
        href={site.routes.feed}
        className="mb-3 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-link/15 transition-colors hover:bg-link/25"
        title={site.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon/prosto_logo.png" alt={site.name} className="h-7 w-7" />
      </Link>

      {/* Unread DM avatars (Discord-style pings between logo and nav) */}
      {unreadDMs.length > 0 && (
        <div className="mb-3 flex w-full flex-col items-center gap-2">
          {unreadDMs.map(dm => {
            const name = dm.displayName ?? dm.username ?? (dm.isGroup ? tm('unnamedGroup') : '?');
            const initial = name?.[0]?.toUpperCase() ?? '?';
            return (
              <Link
                key={dm.conversationId}
                href={`/messages/${dm.publicId ?? ''}`}
                title={name}
                className="group relative flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <div className="relative h-10 w-10 overflow-hidden rounded-full bg-link/20 ring-2 ring-link transition-transform group-hover:scale-105">
                  {dm.avatarUrl
                    ? <AvatarImage src={dm.avatarUrl} alt={name} sizes="40px" className="object-cover" />
                    : dm.isGroup
                      ? <span className="flex h-full w-full items-center justify-center text-link"><Users className="h-5 w-5" /></span>
                      : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-link">{initial}</span>}
                </div>
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
                  {dm.count > 99 ? '99+' : dm.count}
                </span>
              </Link>
            );
          })}
          <span className="h-px w-7 bg-border/40" />
        </div>
      )}

      {/* Nav icons */}
      <div className="flex flex-col items-center gap-1.5">
        {/* Home → your full profile */}
        {myUsername && (
          <Link
            href={site.routes.profile(myUsername)}
            title={t('profile')}
            onPointerEnter={() => router.prefetch(site.routes.profile(myUsername))}
            className={cn(
              'group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors duration-fast',
              pathname === `/u/${myUsername}` ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <House className="h-[20px] w-[20px]" />
            {pathname === `/u/${myUsername}` && <span className="absolute -left-2 h-5 w-1 rounded-full bg-link" />}
          </Link>
        )}

        {/* Chats → messages */}
        <Link
          href={site.routes.messages}
          title={t('messages')}
          onPointerEnter={() => router.prefetch(site.routes.messages)}
          className={cn(
            'group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors duration-fast',
            pathname.startsWith('/messages') ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <MessagesSquare className="h-[20px] w-[20px]" />
          {totalDMs > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
              {totalDMs > 99 ? '99+' : totalDMs}
            </span>
          )}
          {pathname.startsWith('/messages') && <span className="absolute -left-2 h-5 w-1 rounded-full bg-link" />}
        </Link>

        {navItems.map(({ key, icon: Icon, href }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={key}
              href={href}
              title={t(key)}
              onPointerEnter={() => router.prefetch(href)}
              className={cn(
                'group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors duration-fast',
                active
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <Icon className="h-[20px] w-[20px]" />
              {active && (
                <span className="absolute -left-2 h-5 w-1 rounded-full bg-link" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Servers list + create (Discord-style). Vertical padding gives the
          corner badges (pin / ping) of the top & bottom icons room so the
          scroll container's edges don't clip them. */}
      <span className="my-3 h-px w-7 shrink-0 bg-border/40" />
      <div className="flex w-full flex-1 flex-col items-center overflow-y-auto py-1.5">
        <ServerRail />
      </div>
    </nav>
  );
}
