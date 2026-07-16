import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { defaultLocale, locales, type Locale } from './config';
import en from '../../../messages/en.json';
import ru from '../../../messages/ru.json';

// Static imports: statically analyzable, HMR-friendly and reliable in
// production (a fully dynamic `import()` of JSON can serve a stale copy in dev).
const messagesByLocale: Record<Locale, Record<string, unknown>> = { en, ru };

/** Resolve locale once per request: cookie > Accept-Language header > default. */
export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get('locale')?.value;
  if (fromCookie && locales.includes(fromCookie as Locale)) {
    return fromCookie as Locale;
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get('accept-language') ?? '';
  const preferred = acceptLanguage
    .split(',')
    .map((s) => s.split(';')[0]?.trim().split('-')[0])
    .find((lang): lang is string => typeof lang === 'string' && locales.includes(lang as Locale));

  return (preferred as Locale | undefined) ?? defaultLocale;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getMessages = cache(async (): Promise<Record<string, any>> => {
  const locale = await getLocale();
  return messagesByLocale[locale] ?? messagesByLocale[defaultLocale];
});
