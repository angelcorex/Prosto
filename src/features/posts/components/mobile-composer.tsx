'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { useT } from '@/providers/i18n-provider';
import { getBrowserUser, createClient } from '@/lib/supabase/client';
import { onComposerOpen } from '../lib/composer-bus';
import { ComposeBox } from './compose-box';

interface MyProfile {
  avatar_url: string | null;
  username: string;
  is_premium: boolean;
}

/**
 * Full-screen mobile post composer (Twitter-style). Mounted once at the app
 * root; stays dormant until `openComposer()` fires on the composer bus (from the
 * bottom tab bar's + button). Slides up as a full-screen sheet with a close
 * button, then reuses the shared <ComposeBox> in its `fullscreen` variant. On
 * a successful post the box calls `onPosted`, which closes the sheet.
 *
 * Desktop never opens this (the inline ComposeBox in the feed is used there);
 * the bus is only wired to the mobile tab bar.
 */
export function MobileComposer() {
  const t = useT('posts');
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);

  useEffect(() => onComposerOpen(() => setOpen(true)), []);

  // Lazy-load the poster's profile the first time the composer opens.
  useEffect(() => {
    if (!open || profile) return;
    let active = true;
    (async () => {
      const user = await getBrowserUser();
      if (!user) return;
      const sb = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any)
        .from('profiles')
        .select('avatar_url, username, is_premium')
        .eq('id', user.id)
        .maybeSingle();
      if (active && data) setProfile(data as MyProfile);
    })();
    return () => { active = false; };
  }, [open, profile]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex flex-col bg-background pt-[env(safe-area-inset-top)] md:hidden animate-slide-up">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/20 px-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('actions.cancel')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-semibold">{t('compose.title')}</span>
      </div>

      {/* Body — the shared compose box in fullscreen mode */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {profile && (
          <ComposeBox
            variant="fullscreen"
            avatarUrl={profile.avatar_url}
            username={profile.username}
            isPremium={profile.is_premium}
            onPosted={() => setOpen(false)}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
