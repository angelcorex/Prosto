import Link from 'next/link';

import { getLocale, getT } from '@/lib/i18n';
import { site } from '@/config';
import { getLegalDoc, legalDocs, LEGAL_UPDATED, type LegalSlug } from './content';

const SLUGS: LegalSlug[] = ['terms', 'privacy', 'guidelines'];

/**
 * Shared renderer for every legal page: cross-document nav, title, last-updated
 * date, intro and numbered sections. Pages just pass their slug.
 */
export async function LegalDocument({ slug }: { slug: LegalSlug }) {
  const locale = await getLocale();
  const t = await getT('legal');
  const doc = getLegalDoc(slug, locale);

  const updated = new Date(LEGAL_UPDATED).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="mx-auto w-full max-w-2xl">
      <nav className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {SLUGS.map((s) => {
          const active = s === slug;
          return (
            <Link
              key={s}
              href={site.routes.legal[s]}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground transition-colors hover:text-foreground'
              }
            >
              {getLegalDoc(s, locale).title}
            </Link>
          );
        })}
      </nav>

      <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('updated')}: {updated}
      </p>

      <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">{doc.intro}</p>

      <div className="mt-8 flex flex-col gap-8">
        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="text-[15px] leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}

/** Static params helper so the three documents can be statically known. */
export const legalSlugs = Object.keys(legalDocs) as LegalSlug[];
