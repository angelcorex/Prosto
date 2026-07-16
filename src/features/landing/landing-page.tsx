'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { LocaleToggle, buttonClass } from '@/components/ui';
import type { Locale } from '@/lib/i18n/config';
import { Reveal } from './reveal';
import { SmoothScroll } from './smooth-scroll';
import { FeedPreview, ServerPreview, MessagesPreview } from './landing-previews';

/**
 * Public landing (logged-out, web only). Minimalist #111111 page: a floating
 * frosted-glass pill header above everything, a wide short hero panel, a bento
 * collage of colourful product previews (feed + messages on top, the server
 * discovery mock full-width below), a CTA and a footer. Lenis smooth scroll.
 */
export function LandingPage({ locale }: { locale: Locale }) {
  const t = useT('home');
  const router = useRouter();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.prostoDesktop?.isDesktop) {
      setIsDesktop(true);
      router.replace(site.routes.signIn);
    }
  }, [router]);

  if (isDesktop) return null;

  const features = [
    { id: 'feed',     kicker: t('feedKicker'),     title: t('feedTitle'),     text: t('feedText') },
    { id: 'servers',  kicker: t('serversKicker'),  title: t('serversTitle'),  text: t('serversText') },
    { id: 'messages', kicker: t('dmsKicker'),      title: t('dmsTitle'),      text: t('dmsText') },
    { id: 'discover', kicker: t('discoverKicker'), title: t('discoverTitle'), text: t('discoverText') },
  ];

  const year = new Date().getFullYear();
  const btnPrimary = buttonClass({ size: 'lg', className: 'w-full gap-2 bg-white text-black hover:bg-white/90 sm:w-auto' });
  const btnGhost = buttonClass({ variant: 'secondary', size: 'lg', className: 'w-full gap-2 border border-white/15 bg-transparent text-white hover:bg-white/5 sm:w-auto' });

  return (
    <div className="dark relative min-h-dvh bg-[#111111] text-white">
      <SmoothScroll />

      {/* Film grain — above the background, below content. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 noise-layer opacity-[0.08]" />

      {/* ── Floating frosted-glass pill header (always on top) ── */}
      <header className="sticky top-4 z-[100] mt-4 px-4">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between rounded-full border border-white/10 bg-[#161616]/85 pl-5 pr-3 shadow-xl shadow-black/50 backdrop-blur-2xl">
          <Link href={site.routes.home} className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon/prosto_logo.png" alt="" className="h-6 w-6" />
            <span className="text-[16px] font-bold tracking-tight">{site.name}</span>
            <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:inline">
              {t('beta')}
            </span>
          </Link>
          <nav className="flex items-center gap-0.5">
            <Link href={site.routes.legal.terms} className="hidden rounded-lg px-3 py-1.5 text-[13px] text-white/50 transition-colors hover:text-white sm:inline-block">{t('terms')}</Link>
            <Link href={site.routes.legal.privacy} className="hidden rounded-lg px-3 py-1.5 text-[13px] text-white/50 transition-colors hover:text-white md:inline-block">{t('privacy')}</Link>
            <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
            <LocaleToggle locale={locale} />
            <Link href={site.routes.signIn} className={buttonClass({ size: 'sm', className: 'ml-1 rounded-full bg-white text-black hover:bg-white/90' })}>
              {t('openWeb')}
            </Link>
          </nav>
        </div>
      </header>

      <div className="relative z-10">
        {/* ── Hero panel (wide, short) ── */}
        <section className="mx-auto mt-6 max-w-7xl px-4 sm:px-6">
          <Reveal>
            <div className="relative flex min-h-[54vh] flex-col items-center justify-center overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center">
              <div aria-hidden className="pointer-events-none absolute inset-0 noise-layer opacity-[0.06]" />
              <div className="relative flex flex-col items-center">
                <h1 className="mx-auto max-w-4xl text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
                  {t('heading')}
                </h1>
                <p className="mx-auto mt-6 max-w-lg text-[16px] leading-relaxed text-white/50 sm:text-[17px]">
                  {t('description')}
                </p>
                <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
                  <Link href={site.routes.signIn} className={btnPrimary}>
                    {t('openWeb')}
                  </Link>
                  <Link href={site.routes.download} className={btnGhost}>
                    <Download className="h-4 w-4" />
                    {t('downloadDesktop')}
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <main className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* ── Features intro ── */}
          <section className="pt-24 text-center">
            <Reveal>
              <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/40">{t('featuresKicker')}</p>
              <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{t('featuresTitle')}</h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/50">{t('featuresLead')}</p>
            </Reveal>
          </section>

          {/* ── Bento (puzzle): feed + messages on top, discovery full-width ── */}
          <div className="grid grid-cols-1 gap-4 pt-12 lg:grid-cols-2">
            <Reveal><div id="feed" className="h-full scroll-mt-28"><FeedPreview /></div></Reveal>
            <Reveal delay={80}><div id="messages" className="h-full scroll-mt-28"><MessagesPreview /></div></Reveal>
            <Reveal delay={140} className="lg:col-span-2"><div id="servers" className="scroll-mt-28"><ServerPreview /></div></Reveal>
          </div>

          {/* ── Feature cards (no icons) ── */}
          <div className="grid gap-4 pt-12 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <Reveal key={f.id} delay={i * 70}>
                <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/35">{f.kicker}</p>
                  <h3 className="mt-1.5 text-[17px] font-bold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-white/50">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* ── CTA panel ── */}
          <Reveal>
            <section className="relative my-20 overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.02] px-6 py-20 text-center">
              <div aria-hidden className="pointer-events-none absolute inset-0 noise-layer opacity-[0.06]" />
              <div className="relative">
                <h2 className="mx-auto max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">{t('ctaTitle')}</h2>
                <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/55">{t('ctaText')}</p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link href={site.routes.signUp} className={btnPrimary}>
                    {t('createAccount')}
                  </Link>
                  <Link href={site.routes.signIn} className={btnGhost}>{t('signIn')}</Link>
                </div>
              </div>
            </section>
          </Reveal>
        </main>

        {/* ── Footer panel ── */}
        <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-10">
            <div aria-hidden className="pointer-events-none absolute inset-0 noise-layer opacity-[0.06]" />
            <div className="relative grid gap-10 md:grid-cols-[1.8fr_1fr_1fr]">
              <div>
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/favicon/prosto_logo.png" alt="" className="h-7 w-7" />
                  <span className="text-[17px] font-bold tracking-tight">{site.name}</span>
                </div>
                <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/40">{t('footerTagline')}</p>
                <p className="mt-6 text-[12px] text-white/30">© {year} {site.name}. {t('rights')}</p>
              </div>

              <FooterCol title={t('footerLegal')} links={[
                { label: t('terms'), href: site.routes.legal.terms },
                { label: t('privacy'), href: site.routes.legal.privacy },
                { label: t('guidelines'), href: site.routes.legal.guidelines },
              ]} />
              <FooterCol title={t('footerResources')} links={[
                { label: t('downloadDesktop'), href: site.routes.download },
                { label: t('openWeb'), href: site.routes.signIn },
                { label: t('createAccount'), href: site.routes.signUp },
              ]} />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="mb-3 text-[13px] font-semibold text-white">{title}</p>
      <ul className="flex flex-col gap-2.5">
        {links.map((l) => (
          <li key={l.label + l.href}>
            <Link href={l.href} className="text-[13px] text-white/45 transition-colors hover:text-white">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
