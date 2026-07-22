import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';

import { AppProviders } from '@/providers';
import { getLocale, getMessages, getT } from '@/lib/i18n';
import { site, literalColors } from '@/config';
import { DesktopTitlebar } from '@/features/desktop';
import { PwaProvider, ChunkReloadGuard } from '@/features/pwa';
import 'remixicon/fonts/remixicon.css';
import './globals.css';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getT('seo');
  const description = t('description');
  const ogTitle = t('ogTitle');
  const keywords = t('keywords').split(',').map((k) => k.trim()).filter(Boolean);
  const ogLocale = locale === 'ru' ? 'ru_RU' : 'en_US';
  const ogImage = '/favicon/prosto_logo.png';

  return {
    metadataBase: new URL(site.url),
    title: {
      default: ogTitle,
      template: `%s · ${site.name}`,
    },
    description,
    applicationName: site.name,
    keywords,
    authors: [{ name: site.name, url: site.url }],
    creator: site.name,
    publisher: site.name,
    category: 'social',
    manifest: '/manifest.webmanifest',
    alternates: { canonical: site.url },
    appleWebApp: {
      capable: true,
      title: site.name,
      statusBarStyle: 'black-translucent',
    },
    formatDetection: { telephone: false },
    icons: {
      icon: '/favicon/prosto_icon.ico',
      shortcut: '/favicon/prosto_icon.ico',
      apple: '/favicon/prosto_logo.png',
    },
    openGraph: {
      type: 'website',
      siteName: site.name,
      title: ogTitle,
      description,
      url: site.url,
      locale: ogLocale,
      images: [{ url: ogImage, width: 512, height: 512, alt: site.name }],
    },
    twitter: {
      card: 'summary',
      title: ogTitle,
      description,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // Android Chrome: shrink the layout viewport (and 100dvh) when the soft
  // keyboard opens, instead of letting it overlay the content. Without this the
  // chat composer ends up *behind* the keyboard and a full-height gap opens
  // below it. Pairs with the dvh-based shell height.
  interactiveWidget: 'resizes-content',
  // Brand purple — this is the <meta name="theme-color"> that link unfurlers
  // (e.g. Discord) use to tint the embed's accent stripe when a Prosto link is
  // shared. The installed-app system bar stays dark via the manifest's
  // theme_color, so the app itself is unaffected.
  themeColor: literalColors.brand,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const tSeo = await getT('seo');
  // Per-request CSP nonce set by middleware — applied to our inline scripts so
  // they're allowed under the nonce-based policy (Report-Only for now).
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Structured data: helps search engines understand the site + enables a
  // sitelinks search box pointing at our search page.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: site.name,
        url: site.url,
        logo: `${site.url}/favicon/prosto_logo.png`,
      },
      {
        '@type': 'WebSite',
        name: site.name,
        url: site.url,
        description: tSeo('description'),
        inLanguage: locale,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${site.url}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable}`}
    >
      <body className="min-h-dvh font-sans">
        <script
          nonce={nonce}
          // Apply the saved platform style before paint to avoid a flash.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('prosto:style')==='glass')document.documentElement.setAttribute('data-app-style','glass')}catch(e){}` }}
        />
        <script
          type="application/ld+json"
          nonce={nonce}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AppProviders messages={messages} locale={locale}>
          <DesktopTitlebar />
          <PwaProvider />
          <ChunkReloadGuard />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
