'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { X, Bell, LogOut } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { useUnreadNotifications, useUnreadDMs } from '@/features/notifications';
import { leaveServer } from '@/features/servers';
import { useTabs, tabKeyFor, closeTab, type Tab } from './use-tabs';

/**
 * Browser-style tab strip. Opening a server/DM/group adds a tab that remembers
 * where you were; click to jump back, × to close, right-click to leave a
 * server. Always visible on desktop. The notifications bell lives on the right.
 */
export function TabBar() {
  const t = useT('nav');
  const ts = useT('servers');
  const tabs = useTabs();
  const pathname = usePathname();
  const router = useRouter();
  const unread = useUnreadNotifications();
  const dms = useUnreadDMs();
  const [mounted, setMounted] = useState(false);
  const [menu, setMenu] = useState<{ tab: Tab; x: number; y: number } | null>(null);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [menu]);

  if (!mounted) return null;

  const currentKey = tabKeyFor(pathname)?.key ?? null;

  function go(tab: Tab) { router.push(tab.path); }

  function onClose(tab: Tab) {
    const neighbour = closeTab(tab.key);
    if (tab.key === currentKey) router.push(neighbour ? neighbour.path : '/feed');
  }

  async function onLeave(tab: Tab) {
    setMenu(null);
    if (tab.refId) await leaveServer(tab.refId);
    onClose(tab);
  }

  return (
    <div className="hidden h-10 shrink-0 items-center gap-1 border-b border-border/20 bg-background/80 px-2 md:flex">
      <div className="scrollbar-auto-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.key === currentKey;
          const label = tab.title || (tab.kind === 'server' ? t('server') : t('chat'));
          const ping = tab.kind === 'dm'
            ? (dms.find((d) => d.publicId && `dm:${d.publicId}` === tab.key)?.count ?? 0)
            : (active ? 0 : tab.ping ?? 0);
          return (
            <div
              key={tab.key}
              role="button"
              tabIndex={0}
              onClick={() => go(tab)}
              onKeyDown={(e) => { if (e.key === 'Enter') go(tab); }}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ tab, x: e.clientX, y: e.clientY }); }}
              className={cn(
                'group flex h-8 min-w-0 max-w-[240px] cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors',
                active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {tab.icon ? (
                <Image src={tab.icon} alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0 rounded-md object-cover" unoptimized />
              ) : (
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md bg-link/20 text-[10px] font-bold text-link">
                  {label[0]?.toUpperCase() ?? '?'}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
              {ping > 0 ? (
                <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-white">
                  {ping > 99 ? '99+' : ping}
                </span>
              ) : tab.kind === 'server' && tab.count != null ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {tab.count}
                </span>
              ) : null}
              <span
                onClick={(e) => { e.stopPropagation(); onClose(tab); }}
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-muted-foreground/70 opacity-0 transition-all hover:bg-background/70 hover:text-foreground group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            </div>
          );
        })}
      </div>

      {/* Notifications — moved here from the rail */}
      <Link
        href="/notifications"
        title={t('notifications')}
        className={cn(
          'relative grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors',
          pathname.startsWith('/notifications') ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white ring-2 ring-background">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>

      {/* Tab context menu */}
      {menu && typeof document !== 'undefined' && createPortal(
        <div
          className="surface-solid fixed z-[10001] min-w-[180px] overflow-hidden rounded-lg border border-border py-1 shadow-2xl animate-pop-in"
          style={{ top: Math.min(menu.y, window.innerHeight - 120), left: Math.min(menu.x, window.innerWidth - 200) }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.tab.kind === 'server' && menu.tab.refId && (
            <button
              type="button"
              onClick={() => onLeave(menu.tab)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> {ts('leaveServer')}
            </button>
          )}
          <button
            type="button"
            onClick={() => { onClose(menu.tab); setMenu(null); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent/60"
          >
            <X className="h-4 w-4" /> {t('closeTab')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
