'use client';

import Link from 'next/link';
import { Download, Monitor, ArrowLeft, Apple, Terminal } from 'lucide-react';

import { site } from '@/config';

interface Labels {
  title: string;
  subtitle: string;
  windows: string;
  windowsHint: string;
  download: string;
  requirements: string;
  back: string;
  otherSoon: string;
}

export function DownloadClient({ labels, winUrl }: { labels: Labels; winUrl: string }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-5 py-16">
      {/* Back to app */}
      <Link
        href={site.routes.feed}
        className="absolute left-5 top-5 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {labels.back}
      </Link>

      <div className="w-full max-w-md text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon/prosto_logo.png" alt={site.name} className="mx-auto mb-6 h-16 w-16" />

        <h1 className="text-2xl font-bold tracking-tight">{labels.title}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{labels.subtitle}</p>

        {/* Windows card */}
        <div className="mt-8 rounded-2xl border border-border/40 bg-card/60 p-5 text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-link/15 text-link">
              <Monitor className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{labels.windows}</p>
              <p className="text-[13px] text-muted-foreground">{labels.windowsHint}</p>
            </div>
          </div>

          <a
            href={winUrl}
            download
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-link py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Download className="h-[18px] w-[18px]" />
            {labels.download}
          </a>

          <p className="mt-3 text-center text-[12px] text-muted-foreground/70">{labels.requirements}</p>
        </div>

        {/* Other platforms — coming soon */}
        <div className="mt-3 flex items-center justify-center gap-5 text-[13px] text-muted-foreground/50">
          <span className="flex items-center gap-1.5"><Apple className="h-4 w-4" /> macOS</span>
          <span className="flex items-center gap-1.5"><Terminal className="h-4 w-4" /> Linux</span>
          <span>· {labels.otherSoon}</span>
        </div>
      </div>
    </div>
  );
}
