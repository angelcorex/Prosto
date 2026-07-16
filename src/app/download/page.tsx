import type { Metadata } from 'next';
import { getT } from '@/lib/i18n';
import { site } from '@/config';
import { DownloadClient } from './download-client';

export const metadata: Metadata = {
  title: 'Prosto — Desktop',
};

export default async function DownloadPage() {
  const t = await getT('download');

  const labels = {
    title:       t('title'),
    subtitle:    t('subtitle'),
    windows:     t('windows'),
    windowsHint: t('windowsHint'),
    download:    t('downloadCta'),
    requirements: t('requirements'),
    back:        t('back'),
    otherSoon:   t('otherSoon'),
  };

  return <DownloadClient labels={labels} winUrl={site.download.windows} />;
}
