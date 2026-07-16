'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Sparkles, Film, BadgeCheck, Image as ImageIcon,
  MessageSquareText, Timer, Forward, Eraser, AtSign, Check, X, ChevronDown, type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';

export function SuperContent() {
  const t = useT('super');
  const [open, setOpen] = useState<number | null>(null);

  // Ordered to sell: the flashiest, most visible perks first.
  const features: { icon: LucideIcon; title: string; desc: string }[] = [
    { icon: Sparkles,          title: t('perk1Title'), desc: t('perk1Desc') },
    { icon: Film,              title: t('perk7Title'), desc: t('perk7Desc') },
    { icon: BadgeCheck,        title: t('perk2Title'), desc: t('perk2Desc') },
    { icon: ImageIcon,         title: t('perk5Title'), desc: t('perk5Desc') },
    { icon: MessageSquareText, title: t('perk6Title'), desc: t('perk6Desc') },
    { icon: AtSign,            title: t('perk9Title'), desc: t('perk9Desc') },
    { icon: Timer,             title: t('perk3Title'), desc: t('perk3Desc') },
    { icon: Forward,           title: t('perk8Title'), desc: t('perk8Desc') },
    { icon: Eraser,            title: t('perk4Title'), desc: t('perk4Desc') },
  ];

  return (
    <div className="relative h-full w-full overflow-y-auto">
      {/* Soft top glow — fades naturally, nothing clips it */}
      <div className="aurora-page-glow pointer-events-none absolute inset-x-0 top-0 h-[480px]" />

      <div className="relative mx-auto w-full max-w-2xl px-5 py-10 md:py-14">
        <Link
          href={site.routes.messages}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Link>

        {/* Hero */}
        <div className="mt-16 text-center md:mt-24">
          <h1 className="aurora-text aurora-text-glow text-5xl font-medium tracking-tight md:text-7xl">
            {t('name')}
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base text-muted-foreground md:text-lg">{t('tagline')}</p>
        </div>

        {/* Comparison — Basic vs Super (click a row for details) */}
        <div className="mt-28 md:mt-36">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_64px_64px] items-end px-4 pb-2">
            <span />
            <span className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t('basic')}
            </span>
            <span className="aurora-text aurora-text-glow text-center text-sm font-extrabold uppercase tracking-wider">
              {t('tab')}
            </span>
          </div>

          <div className="overflow-hidden rounded-3xl bg-foreground/[0.02]">
            {features.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.title} className={i !== 0 ? 'border-t border-foreground/[0.05]' : ''}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-[1fr_64px_64px] items-center px-4 py-3.5 text-left transition-colors duration-200 hover:bg-foreground/[0.03]"
                  >
                    <span className="flex items-center gap-3">
                      <f.icon className="h-[18px] w-[18px] shrink-0 text-[#b3a8ff]" />
                      <span className="text-sm font-medium">{f.title}</span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-200',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </span>
                    <span className="flex justify-center">
                      <X className="h-[18px] w-[18px] text-muted-foreground/30" />
                    </span>
                    <span className="flex justify-center">
                      <Check className="h-[19px] w-[19px] text-[#8fe9d6]" />
                    </span>
                  </button>
                  {isOpen && (
                    <p className="px-4 pb-4 pl-[46px] text-[13px] leading-relaxed text-muted-foreground">
                      {f.desc}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA — minimal pill, glow lives on the label */}
        <div className="mt-12 flex flex-col items-center">
          <button
            type="button"
            disabled
            className="group flex items-center gap-2 rounded-full bg-foreground/[0.05] px-7 py-2.5 transition-colors duration-300 hover:bg-foreground/[0.08]"
          >
            <Sparkles className="h-[18px] w-[18px] text-[#b3a8ff]" />
            <span className="aurora-text aurora-text-glow text-sm font-bold">{t('cta')}</span>
          </button>
          <p className="mt-3 text-xs text-muted-foreground/60">{t('soon')}</p>
        </div>
      </div>
    </div>
  );
}
