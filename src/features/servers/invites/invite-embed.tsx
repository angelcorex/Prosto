'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { Button, ServerVerifiedBadge } from '@/components/ui';
import { acceptServerInvite } from '../actions';

interface Preview {
  public_id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  is_verified?: boolean;
  description?: string | null;
  tags?: string[] | null;
  member_count: number;
  online_count?: number;
}

const isGradient = (v: string | null | undefined): v is string => !!v && v.startsWith('linear-gradient');

/** Discord-style in-app invite card rendered under a message containing an
 *  invite link. Fetches the server preview and offers a one-tap join. */
export function ServerInviteEmbed({ token }: { token: string }) {
  const t = useT('servers');
  const ta = useT('age');
  const router = useRouter();
  const sbRef = useRef(createClient());
  const [inv, setInv] = useState<Preview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [busy, setBusy] = useState(false);
  const [banned, setBanned] = useState(false);
  const [ageBlocked, setAgeBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('get_server_invite', { p_token: token }).then(({ data }: { data: Preview[] | Preview | null }) => {
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) { setInv(row); setState('ready'); } else { setState('missing'); }
    });
    return () => { active = false; };
  }, [token]);

  async function join() {
    if (busy) return;
    setBusy(true);
    const res = await acceptServerInvite(token);
    if ('publicId' in res && res.publicId) { router.push(site.routes.server(res.publicId)); return; }
    setBusy(false);
    if ('error' in res && res.error === 'banned') setBanned(true);
    else if ('error' in res && res.error === 'age_restricted') setAgeBlocked(true);
  }

  if (state === 'loading') {
    // Mirror the bannerless card layout (no banner block) so the embed doesn't
    // resize when a server without an invite background resolves.
    return (
      <div className="mt-1.5 w-full max-w-[420px] overflow-hidden rounded-2xl bg-card p-3.5 ring-1 ring-border/40">
        <div className="mb-2.5 h-2.5 w-24 animate-skeleton rounded" />
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 animate-skeleton rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-32 animate-skeleton rounded" />
            <div className="h-3 w-40 animate-skeleton rounded" />
          </div>
        </div>
      </div>
    );
  }
  if (state === 'missing' || !inv) {
    return (
      <div className="mt-1.5 w-full max-w-[420px] rounded-2xl bg-card p-3 text-[13px] text-muted-foreground ring-1 ring-border/40">
        {t('inviteNotFound')}
      </div>
    );
  }

  const initial = inv.name[0]?.toUpperCase() ?? '?';

  return (
    <div className="mt-1.5 w-full max-w-[420px] overflow-hidden rounded-2xl bg-card ring-1 ring-border/40">
      {inv.banner_url && (
        <div className="relative h-[72px] w-full">
          {isGradient(inv.banner_url)
            ? <span className="absolute inset-0" style={{ backgroundImage: inv.banner_url }} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={inv.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        </div>
      )}
      <div className="p-3.5">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{t('inviteEmbedTitle')}</p>
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-accent">
            {inv.icon_url
              ? <Image src={inv.icon_url} alt={inv.name} width={48} height={48} className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center text-lg font-bold text-link">{initial}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[15px] font-bold">
              {inv.is_verified && <ServerVerifiedBadge size="sm" />}
              <span className="truncate">{inv.name}</span>
            </p>
            <p className="mt-0.5 flex items-center gap-3 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />{inv.online_count ?? 0} {t('online')}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground/50" />{inv.member_count} {t('membersWord')}</span>
            </p>
          </div>
        </div>
        {inv.description && (
          <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground/90">{inv.description}</p>
        )}
        {inv.tags && inv.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {inv.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground">#{tag}</span>
            ))}
          </div>
        )}
        {banned ? (
          <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-center text-[13px] font-medium text-destructive">
            {t('bannedFromServer')}
          </div>
        ) : ageBlocked ? (
          <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-center text-[13px] font-medium text-destructive">
            {ta('restrictedBody')}
          </div>
        ) : (
          <Button size="md" className="mt-3 w-full" isLoading={busy} onClick={join}>{t('join')}</Button>
        )}
      </div>
    </div>
  );
}
