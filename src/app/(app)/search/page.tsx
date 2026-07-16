import { getT }      from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/request';
import { SearchShell } from './search-shell';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const t      = await getT('search');
  const locale = await getLocale();

  return (
    <SearchShell
      locale={locale}
      initialQuery={q ?? ''}
      labels={{
        placeholder:     t('placeholder'),
        people:          t('people'),
        posts:           t('posts'),
        all:             t('all'),
        noResults:       t('noResults'),
        typeToSearch:    t('typeToSearch'),
        followLabel:     t('follow'),
        trendingTitle:   t('trendingTitle'),
        postsWord:       t('postsWord'),
      }}
    />
  );
}
