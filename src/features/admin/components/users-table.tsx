'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, Shield, Sparkles, Crown, Search } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { site } from '@/config';
import { setUserFlags } from '../api/actions';
import type { AdminUser } from '../types';

type FlagKey = 'is_moderator' | 'is_verified' | 'is_premium' | 'is_admin';

const FLAGS: { key: FlagKey; icon: typeof Shield; labelKey: string; tone: string }[] = [
  { key: 'is_verified',  icon: BadgeCheck, labelKey: 'flagVerified',  tone: 'text-sky-400' },
  { key: 'is_premium',   icon: Sparkles,   labelKey: 'flagPremium',   tone: 'text-[#b3a8ff]' },
  { key: 'is_moderator', icon: Shield,     labelKey: 'flagModerator', tone: 'text-emerald-400' },
  { key: 'is_admin',     icon: Crown,      labelKey: 'flagAdmin',     tone: 'text-amber-400' },
];

export function UsersTable({ initialUsers, initialSearch }: { initialUsers: AdminUser[]; initialSearch: string }) {
  const t = useT('admin');
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [users, setUsers] = useState(initialUsers);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  // Keep local state in sync when the server re-renders with fresh rows.
  useEffect(() => { setUsers(initialUsers); }, [initialUsers]);

  // Debounced search → push ?q= so the server component re-queries.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => {
      const q = new URLSearchParams(params.toString());
      if (search) q.set('q', search); else q.delete('q');
      router.replace(`/admin/users?${q.toString()}`);
    }, 300);
    return () => clearTimeout(id);
  }, [search, params, router]);

  function toggle(user: AdminUser, key: FlagKey) {
    const next = !user[key];
    // Optimistic flip; revert on error.
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, [key]: next } : u)));
    startTransition(async () => {
      const arg =
        key === 'is_moderator' ? { isModerator: next }
        : key === 'is_verified' ? { isVerified: next }
        : key === 'is_premium' ? { isPremium: next }
        : { isAdmin: next };
      const res = await setUserFlags({ targetId: user.id, ...arg });
      if (res?.error) {
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, [key]: !next } : u)));
      }
    });
  }

  return (
    <div>
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-xl border border-border/40 bg-background/50 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-border"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/30">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/30 bg-foreground/[0.02] text-left text-xs uppercase tracking-wider text-muted-foreground/60">
              <th className="px-4 py-3 font-medium">{t('colUser')}</th>
              {FLAGS.map((f) => (
                <th key={f.key} className="px-2 py-3 text-center font-medium">{t(f.labelKey)}</th>
              ))}
              <th className="px-4 py-3 text-right font-medium">{t('colJoined')}</th>
            </tr>
          </thead>
          <tbody className={cn(pending && 'opacity-70')}>
            {users.length === 0 && (
              <tr><td colSpan={FLAGS.length + 2} className="px-4 py-10 text-center text-muted-foreground">{t('noUsers')}</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border/20 transition-colors hover:bg-foreground/[0.02]">
                <td className="px-4 py-3">
                  <Link href={site.routes.profile(u.username)} className="flex items-center gap-3 hover:underline">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : u.username.slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{u.display_name || u.username}</span>
                      <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                    </span>
                  </Link>
                </td>
                {FLAGS.map((f) => {
                  const on = u[f.key];
                  return (
                    <td key={f.key} className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(u, f.key)}
                        disabled={pending}
                        aria-pressed={on}
                        title={t(f.labelKey)}
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                          on ? cn('bg-foreground/[0.06]', f.tone) : 'text-muted-foreground/25 hover:text-muted-foreground/50',
                        )}
                      >
                        <f.icon className="h-[17px] w-[17px]" />
                      </button>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
