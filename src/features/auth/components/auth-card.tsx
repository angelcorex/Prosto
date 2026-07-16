import type { ReactNode } from 'react';

import { site } from '@/config';

/**
 * Form column for the split auth shell. Left-aligned and a touch wider than the
 * old centered card. The logo row only shows below `lg` — on desktop the left
 * brand panel already carries the identity.
 */
export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="w-full max-w-sm">
      {/* Logo + wordmark — mobile only (brand panel covers desktop) */}
      <div className="mb-7 flex items-center gap-2.5 lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon/prosto_logo.png" alt="" className="h-9 w-9" />
        <span className="text-[17px] font-bold tracking-tight">{site.name}</span>
      </div>

      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>

      <div className="mt-6">{children}</div>

      <p className="mt-6 text-[13px] text-muted-foreground">{footer}</p>
    </div>
  );
}
