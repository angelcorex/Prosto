'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';

/**
 * "Download desktop app" button — web-only.
 *
 * Renders nothing inside the Prosto desktop client (you're already in the app
 * there). In the browser it opens the download page, where the Windows
 * installer can be downloaded.
 */
export function DownloadDesktopButton({ className }: { className?: string }) {
  const t = useT('download');
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.prostoDesktop?.isDesktop) {
      setIsDesktop(true);
    }
  }, []);

  if (isDesktop) return null;

  return (
    <Link
      href={site.routes.download}
      title={t('button')}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/60 text-muted-foreground',
        'transition-colors hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      <Download className="h-[18px] w-[18px]" />
    </Link>
  );
}
