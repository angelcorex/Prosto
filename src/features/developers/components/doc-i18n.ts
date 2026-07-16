import { getLocale } from '@/lib/i18n';

/**
 * Docs localization helper. The documentation pages are rich JSX (headings,
 * tables, code blocks) so their prose isn't a good fit for flat i18n JSON.
 * Instead each page reads the locale server-side and picks a string with
 * `tr(en, ru)`. Code samples are shared (not translated).
 *
 * Usage in a page (Server Component):
 *   const tr = await docsTr();
 *   <P>{tr('English text', 'Русский текст')}</P>
 */
export async function docsTr(): Promise<(en: string, ru: string) => string> {
  const locale = await getLocale();
  return (en: string, ru: string) => (locale === 'ru' ? ru : en);
}
