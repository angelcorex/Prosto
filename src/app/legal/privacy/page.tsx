import type { Metadata } from 'next';

import { getLocale } from '@/lib/i18n';
import { LegalDocument, getLegalDoc } from '@/features/legal';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: getLegalDoc('privacy', locale).title };
}

export default function PrivacyPage() {
  return <LegalDocument slug="privacy" />;
}
