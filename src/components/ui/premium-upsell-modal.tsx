'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Sparkles, Film, BadgeCheck, Image as ImageIcon,
  MessageSquareText, Timer, Forward, Eraser, AtSign, X, type LucideIcon,
} from 'lucide-react';

import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';

/**
 * Super Prosto upsell — shown when a free user tries to use a premium-only
 * feature (e.g. a GIF avatar/banner). Lists every perk and links to /super.
 */
export function PremiumUpsellModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT('super');
  if (!open || typeof document === 'undefined') return null;

  const perks: { icon: LucideIcon; label: string }[] = [
    { icon: Film,              label: t('perk7Title') },
    { icon: Sparkles,          label: t('perk1Title') },
    { icon: BadgeCheck,        label: t('perk2Title') },
    { icon: MessageSquareText, label: t('perk6Title') },
    { icon: AtSign,            label: t('perk9Title') },
    { icon: ImageIcon,         label: t('perk5Title') },
    { icon: Timer,             label: t('perk3Title') },
    { icon: Forward,           label: t('perk8Title') },
    { icon: Eraser,            label: t('perk4Title') },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-popover p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aurora-page-glow pointer-events-none absolute inset-x-0 top-0 h-40" />

        <button
          type="button"
          onClick={onClose}
          aria-label={t('back')}
          className="absolute right-4 top-4 z-10 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative text-center">
          <h2 className="aurora-text aurora-text-glow text-2xl font-bold tracking-tight">{t('name')}</h2>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">{t('unlockSubtitle')}</p>
        </div>

        <ul className="relative mt-5 flex flex-col gap-2">
          {perks.map((p) => (
            <li key={p.label} className="flex items-center gap-3 text-[14px]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]">
                <p.icon className="h-[18px] w-[18px] text-[#b3a8ff]" />
              </span>
              <span className="font-medium">{p.label}</span>
            </li>
          ))}
        </ul>

        <Link
          href={site.routes.super}
          onClick={onClose}
          className="relative mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-foreground/[0.06] px-6 py-3 text-sm font-bold transition-colors hover:bg-foreground/[0.1]"
        >
          <Sparkles className="h-[18px] w-[18px] text-[#b3a8ff]" />
          <span className="aurora-text aurora-text-glow">{t('cta')}</span>
        </Link>
      </div>
    </div>,
    document.body,
  );
}
