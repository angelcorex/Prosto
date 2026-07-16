'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import Link from 'next/link';
import { X } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { VerifiedBadge, ModeratorBadge, renderEmojiNodes } from '@/components/ui';

interface FollowUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_moderator: boolean;
}

type ListType = 'followers' | 'following';

/** The two profile counters — clicking either opens a list of those users. */
export function FollowStats({
  username,
  followers,
  following,
}: {
  username: string;
  followers: number;
  following: number;
}) {
  const t = useT('profile');
  const [open, setOpen] = useState<ListType | null>(null);

  return (
    <>
      <div className="mb-4 -ml-2.5 flex items-center gap-1 text-[15px]">
        <button
          type="button"
          onClick={() => setOpen('followers')}
          className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-accent"
        >
          <span className="font-semibold">{followers}</span>
          <span className="text-muted-foreground transition-colors group-hover:text-foreground">{t('followers')}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen('following')}
          className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-accent"
        >
          <span className="font-semibold">{following}</span>
          <span className="text-muted-foreground transition-colors group-hover:text-foreground">{t('following')}</span>
        </button>
      </div>

      {open && <FollowsDialog username={username} type={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function FollowsDialog({ username, type, onClose }: { username: string; type: ListType; onClose: () => void }) {
  const t = useT('profile');
  const sbRef = useRef(createClient());
  const [users, setUsers] = useState<FollowUser[] | null>(null);

  useEffect(() => {
    let active = true;
    const fn = type === 'followers' ? 'get_followers' : 'get_following';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc(fn, { uname: username }).then(({ data }: { data: FollowUser[] | null }) => {
      if (active) setUsers(Array.isArray(data) ? data : []);
    });
    return () => { active = false; };
  }, [username, type]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <h2 className="text-[15px] font-bold">{type === 'followers' ? t('followers') : t('following')}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="scrollbar-auto-hide flex-1 overflow-y-auto p-2">
          {users === null ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2">
                  <div className="h-10 w-10 shrink-0 animate-skeleton rounded-full" />
                  <div className="h-3.5 w-32 animate-skeleton rounded" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-muted-foreground">{t('followEmpty')}</p>
          ) : (
            users.map((u) => {
              const name = u.display_name ?? u.username;
              const initial = name[0]?.toUpperCase() ?? '?';
              return (
                <Link
                  key={u.id}
                  href={site.routes.profile(u.username)}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/50"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-link/20">
                    {u.avatar_url
                      ? <AvatarImage src={u.avatar_url} alt={name} sizes="40px" className="object-cover" />
                      : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-link">{initial}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight">
                      <span className="truncate">{renderEmojiNodes(name)}</span>
                      {u.is_verified && <VerifiedBadge size="sm" />}
                      {u.is_moderator && <ModeratorBadge size="sm" />}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">@{u.username}</p>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
