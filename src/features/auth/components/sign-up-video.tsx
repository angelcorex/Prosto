'use client';

import { useT } from '@/providers/i18n-provider';
import { env } from '@/lib/utils/env';

/**
 * Decorative vertical gameplay loop shown beside the sign-up form.
 *
 * Purely for fun: a muted, looping, phone-format clip whose only job is a
 * light "so you don't fall asleep while creating your account" gag. It carries
 * no branding overlay and no data. The element is hidden from assistive tech
 * and only rendered on wide screens, so it never crowds the form or hurts a11y.
 *
 * The source is fully optional (`NEXT_PUBLIC_SIGNUP_VIDEO_URL`): when it is not
 * configured the component renders nothing, keeping the page valid everywhere.
 */
export function SignUpVideo() {
  const t = useT('auth.signUp');
  const src = env.media.signUpVideoUrl;

  if (!src) return null;

  return (
    <aside aria-hidden className="hidden shrink-0 flex-col items-center gap-3 xl:flex">
      <div className="relative aspect-[9/16] w-[210px] overflow-hidden rounded-2xl border border-white/[0.06] bg-black shadow-lg shadow-black/40">
        <video
          className="h-full w-full object-cover"
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      </div>
      <p className="max-w-[210px] text-center text-xs leading-relaxed text-muted-foreground">
        {t('videoCaption')}
      </p>
    </aside>
  );
}
