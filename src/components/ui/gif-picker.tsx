'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Star, ArrowLeft } from 'lucide-react';

import { cn }           from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT }         from '@/providers/i18n-provider';

interface GifItem {
  id: string;
  url: string;
  preview: string;
  description: string;
}

interface GifPickerProps {
  onSelect: (url: string) => void;
  children: React.ReactNode;
}

type View = 'browse' | 'favorites';

export function GifPicker({ onSelect, children }: GifPickerProps) {
  const t = useT('messages');
  const [open, setOpen]       = useState(false);
  const [coords, setCoords]   = useState({ top: 0, left: 0 });
  const [ready, setReady]     = useState(false);
  const [query, setQuery]     = useState('');
  const [view, setView]       = useState<View>('browse');
  const [items, setItems]     = useState<GifItem[]>([]);
  const [favorites, setFavorites] = useState<GifItem[]>([]);
  const [favUrls, setFavUrls] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);
  const sbRef      = useRef(createClient());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Position the popup above the trigger BEFORE paint (no corner flash) ── */
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const W = 380, H = 460;
    let left = rect.right - W + window.scrollX;
    if (left < 8) left = 8;
    let top = rect.top - H - 8 + window.scrollY;
    if (rect.top - H - 8 < 8) top = rect.bottom + 8 + window.scrollY;
    setCoords({ top, left });
    setReady(true);
  }, [open]);

  /* ── Reset the placement gate on close so the next open re-positions first ── */
  useEffect(() => { if (!open) setReady(false); }, [open]);

  /* ── Close on outside click / Escape ── */
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* ── Fetch GIFs from Tenor proxy ── */
  const fetchGifs = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gifs${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      setItems(data.results ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Load favorites from DB ── */
  const loadFavorites = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sbRef.current as any)
      .from('gif_favorites')
      .select('url, preview')
      .order('created_at', { ascending: false });
    const favs: GifItem[] = (data ?? []).map((r: any) => ({
      id: r.url, url: r.url, preview: r.preview ?? r.url, description: '',
    }));
    setFavorites(favs);
    setFavUrls(new Set(favs.map(f => f.url)));
  }, []);

  /* ── Initial load when opened ── */
  useEffect(() => {
    if (!open) return;
    fetchGifs('');
    loadFavorites();
  }, [open, fetchGifs, loadFavorites]);

  /* ── Debounced search ── */
  useEffect(() => {
    if (!open || view !== 'browse') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, view, fetchGifs]);

  async function toggleFavorite(g: GifItem, e: React.MouseEvent) {
    e.stopPropagation();
    const sb = sbRef.current;
    if (favUrls.has(g.url)) {
      setFavUrls(prev => { const n = new Set(prev); n.delete(g.url); return n; });
      setFavorites(prev => prev.filter(f => f.url !== g.url));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('gif_favorites').delete().eq('url', g.url);
    } else {
      setFavUrls(prev => new Set(prev).add(g.url));
      setFavorites(prev => [g, ...prev]);
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from('gif_favorites').insert({ user_id: user.id, url: g.url, preview: g.preview });
      }
    }
  }

  const shown = view === 'favorites' ? favorites : items;

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(v => !v)} className="inline-flex">
        {children}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999, transformOrigin: 'bottom right', visibility: ready ? 'visible' : 'hidden' }}
          className="surface-solid flex h-[460px] w-[380px] flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl animate-profile-pop"
        >
          {/* ── Header: search + tabs ── */}
          <div className="shrink-0 p-3">
            <div className="flex items-center gap-2">
              {view === 'favorites' && (
                <button
                  type="button"
                  onClick={() => setView('browse')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="h-[18px] w-[18px]" />
                </button>
              )}
              <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-secondary/60 px-3.5 py-2.5 ring-1 ring-transparent transition-all focus-within:bg-secondary/80 focus-within:ring-link/60">
                <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => { setQuery(e.target.value); setView('browse'); }}
                  placeholder={view === 'favorites' ? t('gifFavorites') : t('searchTenor')}
                  className="w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
              </div>
            </div>
          </div>

          {/* ── Grid ── */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {/* Favorites shortcut (only on default browse view) */}
            {view === 'browse' && !query.trim() && (
              <button
                type="button"
                onClick={() => setView('favorites')}
                className="relative mb-2.5 flex h-20 w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-secondary text-[15px] font-semibold text-foreground transition-colors hover:bg-secondary/80"
              >
                {favorites[0] && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={favorites[0].preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                    <span className="absolute inset-0 bg-card/40" />
                  </>
                )}
                <Star className="relative h-[18px] w-[18px]" />
                <span className="relative">{t('gifFavorites')}</span>
              </button>
            )}

            {loading && view === 'browse' && (
              <div className="columns-2 gap-2.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="mb-2.5 w-full animate-pulse rounded-lg bg-secondary/60"
                    style={{ height: 90 + (i % 3) * 40 }}
                  />
                ))}
              </div>
            )}

            {!loading && shown.length === 0 && (
              <p className="py-10 text-center text-[13px] text-muted-foreground/60">
                {view === 'favorites' ? t('gifNoFavorites') : t('gifNoResults')}
              </p>
            )}

            <div className="columns-2 gap-2.5">
              {shown.map(g => (
                <div key={g.id} className="group relative mb-2.5 break-inside-avoid overflow-hidden rounded-lg ring-1 ring-border/40 transition-shadow hover:ring-2 hover:ring-link/60">
                  <button
                    type="button"
                    onClick={() => { onSelect(g.url); setOpen(false); }}
                    className="block w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.preview}
                      alt={g.description || 'gif'}
                      loading="lazy"
                      className="w-full object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={e => toggleFavorite(g, e)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 group-hover:opacity-100"
                  >
                    <Star className={cn('h-4 w-4', favUrls.has(g.url) && 'fill-warning text-warning')} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
