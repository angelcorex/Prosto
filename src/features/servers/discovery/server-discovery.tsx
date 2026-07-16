'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, X, Compass } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { site } from '@/config';
import { useT } from '@/providers/i18n-provider';
import { Button, ServerVerifiedBadge } from '@/components/ui';
import { joinPublicServer } from '../actions';

interface DiscoverServer {
  id: string;
  public_id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
  description: string | null;
  tags: string[] | null;
  member_count: number;
  online_count: number;
  created_at: string;
  is_member: boolean;
}

type Sort = 'popular' | 'new' | 'small';

const isGradient = (v: string | null | undefined): v is string => !!v && v.startsWith('linear-gradient');

export function ServerDiscovery({ onClose }: { onClose: () => void }) {
  const t = useT('servers');
  const router = useRouter();
  const sbRef = useRef(createClient());

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('popular');
  const [items, setItems] = useState<DiscoverServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [bannedId, setBannedId] = useState<string | null>(null);

  const load = useCallback(async (q: string, s: Sort) => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sbRef.current as any).rpc('discover_servers', {
      p_query: q.trim() || null,
      p_sort: s,
      p_limit: 60,
    });
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  // Debounced search; reloads on query/sort change.
  useEffect(() => {
    const id = setTimeout(() => load(query, sort), 280);
    return () => clearTimeout(id);
  }, [query, sort, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function open(s: DiscoverServer) {
    router.push(site.routes.server(s.public_id));
    onClose();
  }

  async function join(s: DiscoverServer) {
    if (joining) return;
    setJoining(s.public_id);
    setBannedId(null);
    const res = await joinPublicServer(s.public_id);
    setJoining(null);
    if ('publicId' in res && res.publicId) {
      window.dispatchEvent(new CustomEvent('servers:changed'));
      router.push(site.routes.server(res.publicId));
      onClose();
      return;
    }
    if ('error' in res && res.error === 'banned') setBannedId(s.public_id);
  }

  const sorts: { id: Sort; label: string }[] = [
    { id: 'popular', label: t('discoverPopular') },
    { id: 'new', label: t('discoverNew') },
    { id: 'small', label: t('discoverSmall') },
  ];

  return (
    typeof document === 'undefined' ? null : createPortal(
    <div className="fixed inset-0 z-[55] flex justify-center bg-background">
      <div className="flex h-full w-full max-w-[920px] flex-col px-6 py-12">
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-link/15 text-link">
            <Compass className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{t('discoverTitle')}</h1>
            <p className="mt-0.5 text-[14px] text-muted-foreground">{t('discoverSubtitle')}</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3.5 py-2.5">
          <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('discoverSearchPlaceholder')}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/50"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort tabs */}
        <div className="mt-3 flex items-center gap-1">
          {sorts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                sort === s.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="scrollbar-auto-hide mt-4 flex-1 overflow-y-auto pb-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[150px] animate-skeleton rounded-2xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-muted-foreground">
              <Compass className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-[15px]">{t('discoverEmpty')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((s) => {
                const initial = s.name[0]?.toUpperCase() ?? '?';
                const tags = (s.tags ?? []).slice(0, 4);
                return (
                  <div key={s.id} className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/40">
                    <div className="relative h-16 w-full bg-gradient-to-br from-link/25 via-accent to-secondary">
                      {isGradient(s.banner_url) ? (
                        <span className="absolute inset-0" style={{ backgroundImage: s.banner_url }} />
                      ) : s.banner_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-accent">
                          {s.icon_url
                            ? <Image src={s.icon_url} alt={s.name} width={48} height={48} className="h-full w-full object-cover" />
                            : <span className="flex h-full w-full items-center justify-center text-lg font-bold text-link">{initial}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[15px] font-bold">
                            {s.is_verified && <ServerVerifiedBadge size="sm" />}
                            <span className="truncate">{s.name}</span>
                          </p>
                          <p className="mt-0.5 flex items-center gap-3 text-[12px] text-muted-foreground">
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />{s.online_count} {t('online')}</span>
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground/50" />{s.member_count} {t('membersWord')}</span>
                          </p>
                        </div>
                      </div>
                      {s.description && (
                        <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-foreground/75">{s.description}</p>
                      )}
                      {tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <span key={tag} className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground">#{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex-1" />
                      {s.is_member ? (
                        <Button variant="secondary" size="sm" className="w-full" onClick={() => open(s)}>{t('discoverOpen')}</Button>
                      ) : bannedId === s.public_id ? (
                        <div className="w-full rounded-lg bg-destructive/10 px-3 py-1.5 text-center text-[12px] font-medium text-destructive">{t('bannedFromServer')}</div>
                      ) : (
                        <Button size="sm" className="w-full" isLoading={joining === s.public_id} onClick={() => join(s)}>{t('join')}</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="fixed right-6 top-6 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={t('cancel')}
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
    )
  );
}
