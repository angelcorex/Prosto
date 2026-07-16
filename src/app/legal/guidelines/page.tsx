import type { Metadata } from 'next';

import { getLocale } from '@/lib/i18n';
import { LegalDocument, getLegalDoc } from '@/features/legal';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: getLegalDoc('guidelines', locale).title };
}

export default function GuidelinesPage() {
  return <LegalDocument slug="guidelines" />;
}
