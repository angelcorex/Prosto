'use client';

import Link from 'next/link';
import { AvatarImage } from '@/components/ui/avatar-image';
import { usePathname } from 'next/navigation';
import { Home, MessagesSquare, Bell, User, Plus } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { site } from '@/config';
import { useUnreadNotifications, useUnreadDMs } from '@/features/notifications';
import { openComposer } from '@/features/posts';

/**
 * Twitter/Telegram-style bottom navigation for phones. A floating pill with four
 * destinations (Home · Chats · Notifications · Profile) and a raised central
 * compose button. Hidden on tablets/desktop (the left rail is used there) and
 * inside a conversation/channel (the composer owns the bottom there).
 */
export function MobileTabBar({ username, avatarUrl }: { username: string | null; avatarUrl: string | null }) {
  const pathname = usePathname();
  const unread = useUnreadNotifications();
  const unreadDMs = useUnreadDMs();
  const totalDMs = unreadDMs.reduce((s, d) => s + (d.count ?? 0), 0);

  // Hidden in a conversation/channel — the composer owns the bottom there.
  const inDetail = /^\/messages\/[^/]+/.test(pathname) || /^\/s\/[^/]+\/[^/]+/.test(pathname);
  if (inDetail) return null;

  // No real username yet → send Profile to settings, never to /u/<guess>.
  const profileHref = username ? `/u/${username}` : '/settings/profile';

  // Central action always opens the full-screen post composer (Twitter-style).
  const onCompose = () => openComposer();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 md:hidden"
      aria-label="Primary"
    >
      <div className="flex w-full max-w-md items-center justify-around gap-1 rounded-[26px] border border-border/40 bg-background/85 px-1.5 py-1.5 shadow-[0_6px_24px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <TabButton href={site.routes.feed} label="Home" active={pathname === site.routes.feed}>
          <Home className="h-[22px] w-[22px]" />
        </TabButton>

        <TabButton href={site.routes.messages} label="Chats" active={pathname.startsWith('/messages')} badge={totalDMs}>
          <MessagesSquare className="h-[22px] w-[22px]" />
        </TabButton>

        {/* Raised compose button */}
        <button
          type="button"
          onClick={onCompose}
          aria-label="Compose"
          className="flex h-12 w-12 shrink-0 -translate-y-1 items-center justify-center rounded-2xl bg-link text-white shadow-[0_8px_20px_-6px_hsl(var(--link)/0.7)] transition-transform active:scale-90"
        >
          <Plus className="h-6 w-6" />
        </button>

        <TabButton href="/notifications" label="Notifications" active={pathname.startsWith('/notifications')} badge={unread}>
          <Bell className="h-[22px] w-[22px]" />
        </TabButton>

        <TabButton href={profileHref} label="Profile" active={pathname === profileHref}>
          {avatarUrl ? (
            <span className={cn('relative h-[26px] w-[26px] overflow-hidden rounded-full ring-1 ring-border/40', pathname === profileHref && 'ring-2 ring-link')}>
              <AvatarImage src={avatarUrl} alt="" sizes="26px" className="object-cover" />
            </span>
          ) : (
            <User className="h-[22px] w-[22px]" />
          )}
        </TabButton>
      </div>
    </nav>
  );
}

function TabButton({ href, label, active, badge, children }: { href: string; label: string; active: boolean; badge?: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors active:bg-accent/60',
        active ? 'text-link' : 'text-muted-foreground',
      )}
    >
      {children}
      {active && <span className="h-1 w-1 rounded-full bg-link" />}
      {badge != null && badge > 0 && (
        <span className="absolute right-1.5 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
