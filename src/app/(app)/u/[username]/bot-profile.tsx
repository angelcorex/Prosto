import Link from 'next/link';
import Image from 'next/image';
import { CalendarDays, Terminal } from 'lucide-react';

import { getT } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/request';
import { site } from '@/config';
import { AvatarImage } from '@/components/ui/avatar-image';
import { buttonClass, VerifiedBadge, BotBadge, EmojiText } from '@/components/ui';
import { PostText } from '@/features/posts';

interface BotProfileData {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_verified?: boolean;
  created_at: string | null;
}


export async function BotProfile({ profile }: { profile: BotProfileData }) {
  const t = await getT('profile');
  const locale = await getLocale();
  const displayName = profile.display_name ?? profile.username;
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const joinedDate = profile.created_at
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))
    : '';

  return (
    <div className="mx-auto w-full max-w-2xl md:pb-10">
      {/* Banner */}
      <div className="relative mx-4 mt-4 h-44 overflow-hidden rounded-2xl sm:h-52">
        {profile.banner_url ? (
          <Image src={profile.banner_url} alt="" fill className="object-cover" priority />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
      </div>

      {/* Avatar */}
      <div className="mx-6 -mt-14 flex items-end">
        <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-full bg-primary/10 ring-4 ring-background">
          {profile.avatar_url ? (
            <AvatarImage src={profile.avatar_url} alt={displayName} sizes="100px" className="object-cover" animate />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-primary">{initial}</span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="mx-6 mt-4">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <h1 className="min-w-0 truncate text-2xl font-bold leading-tight">
              <EmojiText content={displayName} clamp />
            </h1>
            <BotBadge size="md" />
            {profile.is_verified && <VerifiedBadge size="md" sinceDate={profile.created_at ?? undefined} />}
          </span>
          <span className="text-[15px] text-muted-foreground">@{profile.username}</span>
        </div>

        {/* "Automated account" note — reinforces this isn't a person. */}
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2.5 py-1 text-[13px] font-medium text-sky-500">
          <Terminal className="h-3.5 w-3.5" />
          {t('botAccount')}
        </div>

        {/* Bio (if the owner set one) */}
        {profile.bio && <PostText content={profile.bio} className="mb-4 text-[15px] text-foreground/80" />}

        {/* Joined */}
        {joinedDate && (
          <div className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span>{t('joined')} {joinedDate}</span>
          </div>
        )}
      </div>

      {/* No posts, followers, following, or actions — a bot is not a social actor. */}
      <div className="mx-6 mt-6 rounded-2xl border border-dashed border-border py-10 text-center">
        <p className="text-sm text-muted-foreground">{t('botNoContent')}</p>
        <Link href={site.routes.feed} className={`${buttonClass({ variant: 'secondary', size: 'sm' })} mt-3`}>
          {t('backToFeed')}
        </Link>
      </div>
    </div>
  );
}
