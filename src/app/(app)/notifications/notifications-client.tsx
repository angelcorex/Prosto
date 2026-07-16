'use client';
import { AvatarImage } from '@/components/ui/avatar-image';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, Check, X, UserPlus, UserCheck, Reply, Heart, MessageCircle, Repeat2 } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { VerifiedBadge, ModeratorBadge, renderEmojiNodes } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { acceptFriendRequest, declineFriendRequest } from '@/features/social';
import type { NotificationItem } from './page';

interface Props {
  initialItems: NotificationItem[];
  myId: string;
  locale: string;
}

function relativeTime(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  const rtf  = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (min < 1)  return rtf.format(0, 'minute');
  if (min < 60) return rtf.format(-min, 'minute');
  const h = Math.floor(min / 60);
  if (h < 24)   return rtf.format(-h, 'hour');
  const d = Math.floor(h / 24);
  if (d < 7)    return rtf.format(-d, 'day');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso));
}

export function NotificationsClient({ initialItems, myId, locale }: Props) {
  const t = useT('notifications');
  const router = useRouter();
  const [items] = useState(initialItems);
  const sbRef = useRef(createClient());

  // Read state is persisted server-side in the page loader (reliable across
  // reloads / fast navigation). Here we just tell the bell badge to clear now.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('notifications:read'));
  }, []);

  // Realtime: pull fresh data when a new notification arrives.
  useEffect(() => {
    const sb = sbRef.current;
    const ch = sb
      .channel(`notif:${myId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}`,
      }, () => router.refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [myId, router]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="sticky top-0 z-sticky flex items-center gap-3 border-b border-border/30 bg-background/95 px-4 py-3.5">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[16px] font-bold">{t('title')}</h1>
      </div>

      <div className="px-2 py-2">
        {items.length === 0 ? (
          <p className="py-16 text-center text-[15px] text-muted-foreground">{t('empty')}</p>
        ) : (
          items.map(n => (
            <Row key={n.id} n={n} locale={locale} router={router} />
          ))
        )}
      </div>
    </div>
  );
}

function Row({
  n, locale, router,
}: {
  n: NotificationItem; locale: string; router: ReturnType<typeof useRouter>;
}) {
  const t = useT('notifications');
  const [, startTransition] = useTransition();
  const [handled, setHandled] = useState(false);

  const actor = n.actor;
  const name  = actor?.display_name ?? actor?.username ?? '?';
  const initial = name[0]?.toUpperCase() ?? '?';

  const text =
    n.type === 'follow'          ? t('follow')
    : n.type === 'friend_request' ? t('friendRequest')
    : n.type === 'friend_accepted' ? t('friendAccepted')
    : n.type === 'mention'        ? t('mention')
    : n.type === 'like'           ? t('like')
    : n.type === 'comment'        ? t('comment')
    : n.type === 'repost'         ? t('repost')
    : '';

  const Icon = n.type === 'friend_accepted' ? UserCheck
    : n.type === 'friend_request' ? UserPlus
    : n.type === 'mention' ? Reply
    : n.type === 'like' ? Heart
    : n.type === 'comment' ? MessageCircle
    : n.type === 'repost' ? Repeat2
    : Bell;

  // Server-resolved destination (DM, server channel + jump, post, or profile).
  const postHref = n.href;

  function act(action: (fd: FormData) => Promise<unknown>) {
    if (!n.actor_id) return;
    const fd = new FormData();
    fd.append('from_id', n.actor_id);
    setHandled(true);
    startTransition(async () => {
      await action(fd);
      window.dispatchEvent(new CustomEvent('friends:changed'));
      router.refresh();
    });
  }

  return (
    <div className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors', !n.read && 'bg-link/5')}>
      <Link href={actor ? `/u/${actor.username}` : '#'} className="relative shrink-0">
        <div className="relative h-10 w-10 overflow-hidden rounded-full bg-link/20">
          {actor?.avatar_url
            ? <AvatarImage src={actor.avatar_url} alt={name} className="object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-base font-bold text-link">{initial}</span>}
        </div>
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-card text-link">
          <Icon className="h-3 w-3" />
        </span>
      </Link>

      <div className="min-w-0 flex-1 text-[14px] leading-snug">
        {postHref ? (
          <Link href={postHref} className="block">
            <span className="font-semibold">{renderEmojiNodes(name)}</span>
            {actor?.is_verified && <span className="ml-1 inline-flex align-middle"><VerifiedBadge size="sm" /></span>}
            {actor?.is_moderator && <span className="ml-1 inline-flex align-middle"><ModeratorBadge size="sm" /></span>}{' '}
            <span className="text-muted-foreground">{text}</span>
            <span className="ml-1 text-[12px] text-muted-foreground/50">· {relativeTime(n.created_at, locale)}</span>
          </Link>
        ) : (
          <>
            <span className="font-semibold">{renderEmojiNodes(name)}</span>
            {actor?.is_verified && <span className="ml-1 inline-flex align-middle"><VerifiedBadge size="sm" /></span>}
            {actor?.is_moderator && <span className="ml-1 inline-flex align-middle"><ModeratorBadge size="sm" /></span>}{' '}
            <span className="text-muted-foreground">{text}</span>
            <span className="ml-1 text-[12px] text-muted-foreground/50">· {relativeTime(n.created_at, locale)}</span>
          </>
        )}
      </div>

      {n.type === 'friend_request' && !handled && (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button" title={t('accept')}
            onClick={() => act(acceptFriendRequest)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 text-success transition-colors hover:bg-success/20"
          >
            <Check className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button" title={t('decline')}
            onClick={() => act(declineFriendRequest)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}
    </div>
  );
}
