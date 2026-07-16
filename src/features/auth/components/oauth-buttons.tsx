'use client';

import { useState } from 'react';
import { Google, Github, Discord } from '@/lib/icons';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { createClient } from '@/lib/supabase/client';
import { site } from '@/config';

type Provider = 'google' | 'github' | 'discord';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

/**
 * Base URL the OAuth flow returns to. On a real deployment we always use the
 * canonical site URL (env override or {@link site.url}) so the provider can
 * never bounce us onto a preview host (vercel.app) or a stale origin. Only true
 * localhost origins return to themselves, so local development still works.
 */
function oauthRedirectBase(): string {
  // On a real localhost origin, return to it so local dev works.
  if (typeof window !== 'undefined' && LOCAL_HOSTS.includes(window.location.hostname)) {
    return window.location.origin;
  }
  // Otherwise force the canonical domain. A stale NEXT_PUBLIC_SITE_URL pointing
  // at localhost (leftover from local testing) must never poison a deployment,
  // so it's ignored unless it's a real public URL.
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const configuredIsLocal = LOCAL_HOSTS.some((h) => configured.includes(h));
  return configured && !configuredIsLocal ? configured : site.url;
}

const PROVIDERS: { id: Provider; icon: typeof Google; labelKey: string; className: string }[] = [
  { id: 'google', icon: Google, labelKey: 'google', className: 'hover:border-[#ea4335]/50 hover:text-[#ea4335]' },
  { id: 'github', icon: Github, labelKey: 'github', className: 'hover:border-foreground/40 hover:text-foreground' },
  { id: 'discord', icon: Discord, labelKey: 'discord', className: 'hover:border-[#5865f2]/50 hover:text-[#5865f2]' },
];


export function OAuthButtons({ next }: { next?: string }) {
  const t = useT('auth.oauth');
  const [busy, setBusy] = useState<Provider | null>(null);

  async function signInWith(provider: Provider) {
    if (busy) return;
    setBusy(provider);
    try {
      const sb = createClient();
      const desktop = typeof window !== 'undefined' && !!window.prostoDesktop?.isDesktop;
      const params = new URLSearchParams();
      if (next) params.set('next', next);
      // Desktop: the provider page must open in the system browser (Google
      // refuses embedded WebViews, and we never want auth captured in-app). The
      // callback is told to bounce the browser back to the app via a prosto://
      // deep link, where the PKCE verifier cookie lives, so the code exchange
      // completes inside the app and the session is established there.
      if (desktop) params.set('desktop', '1');
      const redirectTo = `${oauthRedirectBase()}/auth/callback${params.toString() ? `?${params}` : ''}`;

      const { data, error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: desktop },
      });
      if (error) {
        setBusy(null); // stay on the page; a redirect would otherwise take over
        return;
      }
      // Desktop: we suppressed the auto-redirect — open the provider URL in the
      // OS browser instead. (In a normal browser, Supabase already redirected.)
      if (desktop && data?.url) {
        window.prostoDesktop!.openExternal?.(data.url);
        // Leave the spinner running; the app returns via the prosto:// deep link.
      }
    } catch {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Divider */}
      <div className="flex items-center gap-3 text-[12px] text-muted-foreground/60">
        <span className="h-px flex-1 bg-border/60" />
        {t('or')}
        <span className="h-px flex-1 bg-border/60" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PROVIDERS.map(({ id, icon: Icon, labelKey, className }) => (
          <button
            key={id}
            type="button"
            onClick={() => signInWith(id)}
            disabled={busy !== null}
            aria-label={t(labelKey)}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-background text-[13px] font-medium text-muted-foreground transition-colors disabled:opacity-50',
              className,
            )}
          >
            {busy === id ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon className="h-[18px] w-[18px]" />
            )}
            <span className="hidden sm:inline">{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
