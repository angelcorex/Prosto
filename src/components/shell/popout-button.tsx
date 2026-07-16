'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';

/** Open a chat/channel path as a floating widget window (desktop) or a browser popup. */
export function popoutChat(relPath: string) {
  const url = `${relPath}${relPath.includes('?') ? '&' : '?'}widget=1`;
  const d = window.prostoDesktop;
  if (d?.isDesktop && d.popout) {
    d.popout(url);
    return;
  }
  // Browser fallback: a small standalone popup window.
  window.open(url, `prosto-widget-${relPath}`, 'popup,width=420,height=620,noopener');
}

/**
 * Button that pops the current chat/channel out into a separate floating
 * window. Hidden inside an existing widget window; hidden on phones.
 */
export function PopoutButton({ className }: { className?: string }) {
  const t = useT('nav');
  const pathname = usePathname();
  const [inWidget, setInWidget] = useState(true);

  useEffect(() => {
    setInWidget(new URLSearchParams(window.location.search).get('widget') === '1');
  }, []);

  if (inWidget) return null;

  return (
    <button
      type="button"
      title={t('popOut')}
      aria-label={t('popOut')}
      onClick={() => popoutChat(pathname)}
      className={cn(
        'hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:flex',
        className,
      )}
    >
      <ExternalLink className="h-[18px] w-[18px]" />
    </button>
  );
}
