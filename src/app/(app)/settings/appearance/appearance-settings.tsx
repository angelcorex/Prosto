'use client';

import Link from 'next/link';

import { LocaleToggle, ThemeToggle } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { StylePicker } from '@/features/appearance';
import type { Locale } from '@/lib/i18n/config';

export function AppearanceSettings({ locale }: { locale: Locale }) {
  const t = useT('settings');

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-lg font-bold tracking-tight">{t('appearance')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('clientSubtitle')}</p>

      {/* Platform style */}
      <div className="mb-4 rounded-2xl bg-secondary/40 p-4">
        <p className="text-sm font-semibold">{t('style')}</p>
        <p className="mb-3 text-[13px] text-muted-foreground">{t('styleHint')}</p>
        <StylePicker />
      </div>

      {/* Theme */}
      <div className="mb-4 rounded-2xl bg-secondary/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{t('theme')}</p>
            <p className="text-[13px] text-muted-foreground">{t('themeHint')}</p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Language */}
      <div className="mb-4 rounded-2xl bg-secondary/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{t('language')}</p>
            <p className="text-[13px] text-muted-foreground">{t('languageHint')}</p>
          </div>
          <LocaleToggle locale={locale} />
        </div>
      </div>

      {/* Legal */}
      <div className="rounded-2xl bg-secondary/40 p-4">
        <p className="mb-2 text-sm font-semibold">{t('legal')}</p>
        <div className="flex flex-col gap-1.5">
          <Link href={site.routes.legal.terms} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">{t('terms')}</Link>
          <Link href={site.routes.legal.privacy} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">{t('privacyLink')}</Link>
          <Link href={site.routes.legal.guidelines} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">{t('guidelines')}</Link>
        </div>
        <p className="mt-3 text-xs text-muted-foreground/60">© 2026 Prosto</p>
      </div>
    </div>
  );
}
