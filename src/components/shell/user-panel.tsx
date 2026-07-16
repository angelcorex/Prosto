'use client';
import { AvatarImage } from '@/components/ui/avatar-image';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';

import { cn }            from '@/lib/utils/cn';
import { createClient }  from '@/lib/supabase/client';
import { VerifiedBadge, ModeratorBadge, PremiumBadge, EmojiText, BadgeCluster } from '@/components/ui';
import { AvatarWithStatus, usePresence, DeviceBadge } from '@/features/presence';
import { useT }          from '@/providers/i18n-provider';
import { AccountsModal, AddAccountModal } from '@/features/accounts';
import { ProfilePopup }  from './profile-popup';

interface UserPanelProps {
  username: string | null;
  userId?: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  displayName?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  isVerified?: boolean;
  isModerator?: boolean;
  isPremium?: boolean;
  status?: string | null;
  lastSeen?: string | null;
  customStatus?: string | null;
}

export function UserPanel({ username, userId, avatarUrl, bannerUrl, displayName, pronouns, bio, isVerified, isModerator, isPremium, status, lastSeen, customStatus }: UserPanelProps) {
  const tn = useT('nav');
  const [open, setOpen] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  // Editable profile fields kept live so the panel reflects avatar/name/banner
  // changes instantly (from this or another device) without a full reload.
  // Seeded from SSR props; refreshed by a realtime subscription on our own row.
  const [me, setMe] = useState({ avatarUrl, displayName, bannerUrl, pronouns, bio, customStatus });
  useEffect(() => {
    setMe({ avatarUrl, displayName, bannerUrl, pronouns, bio, customStatus });
  }, [avatarUrl, displayName, bannerUrl, pronouns, bio, customStatus]);
  useEffect(() => {
    if (!userId) return;
    const sb = createClient();
    const ch = sb
      .channel(`me-profile:${userId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload: any) => {
        const r = payload.new ?? {};
        setMe({
          avatarUrl: r.avatar_url ?? null,
          displayName: r.display_name ?? null,
          bannerUrl: r.banner_url ?? null,
          pronouns: r.pronouns ?? null,
          bio: r.bio ?? null,
          customStatus: r.custom_status ?? null,
        });
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);

  const initial         = (me.displayName ?? username ?? '?')[0]?.toUpperCase() ?? '?';

  // Live presence so the user's own status reflects changes instantly.
  const live = usePresence(userId, status, lastSeen);
  const liveStatus   = live.status;
  const liveLastSeen = live.last_seen;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const popupUser = {
    username: username ?? '',
    display_name: me.displayName,
    avatar_url:   me.avatarUrl,
    banner_url:   me.bannerUrl,
    pronouns:     me.pronouns,
    bio:          me.bio,
    is_verified:  isVerified,
    is_moderator: isModerator,
    is_premium:   isPremium,
    status:       liveStatus,
    last_seen:    liveLastSeen,
    custom_status: me.customStatus,
  };

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md px-2 pb-2 md:mx-0 md:max-w-none">

      {/* ── Trigger — larger touch target on phones ── */}
      <div className={cn(
        'flex w-full items-center gap-1 rounded-[14px] pr-1.5 transition-colors duration-fast',
        open ? 'bg-accent' : 'bg-muted/40 hover:bg-accent',
      )}>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] px-3 py-3 text-left md:py-2.5"
        >
          <span className="md:hidden">
            <AvatarWithStatus status={liveStatus} lastSeen={liveLastSeen} size={44} dotSize={9}>
              {me.avatarUrl ? (
                <AvatarImage src={me.avatarUrl} alt={initial} className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-base font-bold text-link leading-none">{initial}</span>
              )}
            </AvatarWithStatus>
          </span>
          <span className="hidden md:block">
            <AvatarWithStatus status={liveStatus} lastSeen={liveLastSeen} size={36} dotSize={8}>
              {me.avatarUrl ? (
                <AvatarImage src={me.avatarUrl} alt={initial} className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-bold text-link leading-none">{initial}</span>
              )}
            </AvatarWithStatus>
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[15px] font-semibold leading-tight md:text-sm">
              <EmojiText content={me.displayName ?? username ?? ''} clamp className={cn('truncate', isPremium && 'aurora-text aurora-text-glow-soft')} />
              {/* 2+ badges collapse behind a single expandable trigger; a lone
                  badge shows inline. Devices are a separate cluster. */}
              <BadgeCluster>
                {isVerified && <VerifiedBadge size="sm" />}
                {isModerator && <ModeratorBadge size="sm" />}
                {isPremium && <PremiumBadge size="sm" />}
              </BadgeCluster>
              <DeviceBadge userId={userId} collapse />
            </p>
            {me.customStatus?.trim() ? (
              <p className="truncate text-[13px] text-muted-foreground md:text-xs">
                <EmojiText content={me.customStatus.trim()} clamp className="truncate" />
              </p>
            ) : username ? (
              <p className="truncate text-[13px] text-muted-foreground md:text-xs">@{username}</p>
            ) : null}
          </div>
        </button>

        {/* Settings gear — Discord-style, beside the profile */}
        <Link
          href="/settings"
          title={tn('settings')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>
      </div>

      {/* ── Desktop: popover opens upward ── */}
      {open && !isMobile && (
        <div className="absolute bottom-[calc(100%+10px)] left-0 z-modal w-[280px]">
          <ProfilePopup
            user={popupUser}
            accountMenu
            onClose={() => setOpen(false)}
            onManageAccounts={() => setShowAccounts(true)}
            onAddAccount={() => setShowAddAccount(true)}
          />
        </div>
      )}

      {/* ── Mobile: bottom sheet sliding up ── */}
      {open && isMobile && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end bg-black/50 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full animate-slide-up pb-[env(safe-area-inset-bottom)] [&>div]:rounded-b-none"
          >
            <ProfilePopup
              user={popupUser}
              accountMenu
              onClose={() => setOpen(false)}
              onManageAccounts={() => setShowAccounts(true)}
              onAddAccount={() => setShowAddAccount(true)}
            />
          </div>
        </div>,
        document.body,
      )}

      {showAccounts && <AccountsModal onClose={() => setShowAccounts(false)} />}
      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
    </div>
  );
}
