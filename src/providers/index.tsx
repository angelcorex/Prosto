import type { ReactNode } from 'react';

import { ThemeProvider } from './theme-provider';
import { I18nProvider } from './i18n-provider';
import { PlatformStyleProvider } from '@/features/appearance';
import { ImageViewerProvider } from '@/features/media';

export function AppProviders({
  children,
  messages,
  locale,
}: {
  children: ReactNode;
  messages: Record<string, unknown>;
  locale: string;
}) {
  return (
    <I18nProvider messages={messages} locale={locale}>
      <ThemeProvider>
        <PlatformStyleProvider />
        <ImageViewerProvider>
          {children}
        </ImageViewerProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
