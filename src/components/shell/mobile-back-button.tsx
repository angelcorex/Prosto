'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Floating back arrow for phones. Shown on secondary screens (a channel, a
 * profile, notifications, settings, search…) — hidden on the home feed, the
 * chats/channel list roots and DM conversations (which carry their own back).
 */
export function MobileBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [widget, setWidget] = useState(false);

  useEffect(() => {
    setWidget(new URLSearchParams(window.location.search).get('widget') === '1');
  }, []);

  const hidden =
    widget ||
    pathname === '/feed' ||
    pathname === '/messages' ||
    /^\/messages\/[^/]+/.test(pathname) ||   // DM conversation has its own back
    /^\/s\/[^/]+$/.test(pathname);           // server channel-list root

  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Back"
      className="fixed left-3 top-[calc(env(safe-area-inset-top)+0.6rem)] z-30 flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-background/70 text-foreground shadow-sm backdrop-blur-md transition-colors active:bg-accent md:hidden"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
