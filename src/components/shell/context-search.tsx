'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Search, X, User, Paperclip, AtSign, SlidersHorizontal, Clock, Trash2, CalendarDays, ArrowLeft, Image as ImageIcon, Film, Link2, FileText } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { renderEmojiNodes } from '@/components/ui';

/**
 * Context-aware filter search — the top bar of the right panel.
 *
 * A Discord-style *filter* search scoped to the current view (DM / server /
 * feed), separate from the left-hand content search page. Picking a filter opens
 * a guided value picker (users, attachment type, date); the chosen filter is
 * pinned into the input as a removable chip so it's clear what's being searched.
 * Submitting runs the scoped `search_*_messages` RPC and lists the hits.
 */

type Scope =
  | { kind: 'dm'; id: string }
  | { kind: 'server'; id: string; name: string | null }
  | { kind: 'feed' };

type FilterKey = 'from' | 'mentions' | 'has' | 'before' | 'after';

interface SuggestUser {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Marks the current user in the DM picker ("you"). */
  self?: boolean;
}

/** An active filter shown as a chip in the input. */
interface Chip {
  key: FilterKey;
  value: string;
  user?: SuggestUser;
}

interface MessageHit {
  id: string;
  content: string;
  created_at: string;
  channel_public_id?: string | null;
  channel_name?: string | null;
  sender_username: string;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
}

interface ContextSearchProps {
  myUsername?: string | null;
  myDisplayName?: string | null;
  myAvatar?: string | null;
}

const HISTORY_MAX = 8;

function historyKey(scope: Scope): string {
  if (scope.kind === 'server') return `prosto:fsearch:server:${scope.id}`;
  if (scope.kind === 'dm') return `prosto:fsearch:dm:${scope.id}`;
  return 'prosto:fsearch:feed';
}

function readHistory(key: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeHistory(key: string, list: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, HISTORY_MAX))); } catch { /* quota */ }
}

const FILTER_KEYS: FilterKey[] = ['from', 'mentions', 'has', 'before', 'after'];

/** Split a raw query string into chips + leftover free text (for history replay / typed tokens). */
function parseToChips(raw: string): { chips: Chip[]; text: string } {
  const words: string[] = [];
  const chips: Chip[] = [];
  for (const tok of raw.trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^(from|mentions|has|before|after):(.+)$/i);
    if (!m) { words.push(tok); continue; }
    chips.push({ key: m[1]!.toLowerCase() as FilterKey, value: m[2]!.replace(/^@/, '') });
  }
  return { chips, text: words.join(' ') };
}

/** Serialize chips + free text back into a query string (history + feed search). */
function serialize(chips: Chip[], text: string): string {
  const toks = chips.map((c) => `${c.key}:${c.value}`);
  if (text.trim()) toks.push(text.trim());
  return toks.join(' ');
}

/** Resolve the current search scope from the route (+ cached server name). */
function useScope(): Scope {
  const pathname = usePathname();
  return useMemo<Scope>(() => {
    const dm = pathname.match(/^\/messages\/([^/]+)/);
    if (dm?.[1]) return { kind: 'dm', id: dm[1] };
    const srv = pathname.match(/^\/s\/([^/]+)/);
    if (srv?.[1]) {
      let name: string | null = null;
      if (typeof sessionStorage !== 'undefined') {
        try {
          const raw = sessionStorage.getItem(`prosto:server-cache:${srv[1]}`);
          if (raw) name = (JSON.parse(raw)?.server?.name as string) ?? null;
        } catch { /* ignore */ }
      }
      return { kind: 'server', id: srv[1], name };
    }
    return { kind: 'feed' };
  }, [pathname]);
}

export function ContextSearch({ myUsername, myDisplayName, myAvatar }: ContextSearchProps = {}) {
  const t = useT('search');
  const router = useRouter();
  const scope = useScope();
  const sbRef = useRef(createClient());

  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<Chip[]>([]);
  const [picking, setPicking] = useState<FilterKey | null>(null);
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [results, setResults] = useState<MessageHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [people, setPeople] = useState<SuggestUser[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hKey = historyKey(scope);

  // Reset state whenever the scope changes.
  useEffect(() => {
    setQuery('');
    setChips([]);
    setPicking(null);
    setShowMore(false);
    setResults(null);
    setHistory(readHistory(hKey));
  }, [hKey]);

  // Candidate users for the `from:` / `mentions:` picker — server members from
  // the sidebar cache, or (in a DM) yourself + the other participant.
  useEffect(() => {
    let active = true;
    const self: SuggestUser | null = myUsername
      ? { username: myUsername, display_name: myDisplayName ?? null, avatar_url: myAvatar ?? null, self: true }
      : null;

    if (scope.kind === 'server') {
      let members: SuggestUser[] = [];
      if (typeof sessionStorage !== 'undefined') {
        try {
          const raw = sessionStorage.getItem(`prosto:members-cache:${scope.id}`);
          const parsed = raw ? JSON.parse(raw) : null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          members = Array.isArray(parsed?.members) ? parsed.members.map((m: any) => ({ username: m.username, display_name: m.display_name, avatar_url: m.avatar_url })) : [];
        } catch { /* ignore */ }
      }
      setPeople(members);
      return;
    }

    if (scope.kind === 'dm') {
      setPeople(self ? [self] : []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbRef.current as any)
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('public_id', scope.id)
        .maybeSingle()
        .then(({ data }: { data: SuggestUser | null }) => {
          if (!active || !data?.username || data.username === myUsername) return;
          setPeople(self ? [data, self] : [data]);
        });
      return () => { active = false; };
    }

    setPeople(self ? [self] : []);
    return () => { active = false; };
  }, [scope, myUsername, myDisplayName, myAvatar]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const placeholder =
    scope.kind === 'dm' ? t('scopeDm')
    : scope.kind === 'server' ? (scope.name ? t('scopeServerNamed', { name: scope.name }) : t('scopeServer'))
    : t('scopeFeed');

  const filters: { key: FilterKey; title: string; hint: string; icon: typeof User }[] = useMemo(() => {
    const base = [
      { key: 'from' as const, title: t('fromTitle'), hint: t('fromHint'), icon: User },
      { key: 'has' as const, title: t('hasTitle'), hint: t('hasHint'), icon: Paperclip },
      { key: 'mentions' as const, title: t('mentionsTitle'), hint: t('mentionsHint'), icon: AtSign },
    ];
    const more = [
      { key: 'before' as const, title: t('beforeTitle'), hint: t('beforeHint'), icon: CalendarDays },
      { key: 'after' as const, title: t('afterTitle'), hint: t('afterHint'), icon: CalendarDays },
    ];
    return showMore ? [...base, ...more] : base;
  }, [showMore, t]);

  const addChip = useCallback((key: FilterKey, value: string, user?: SuggestUser) => {
    if (!value) return;
    setChips((prev) => [...prev.filter((c) => c.key !== key), { key, value, user }]);
    setPicking(null);
    setResults(null);
    inputRef.current?.focus();
    setOpen(true);
  }, []);

  const removeChip = useCallback((key: FilterKey) => {
    setChips((prev) => prev.filter((c) => c.key !== key));
    setResults(null);
  }, []);

  const runSearch = useCallback(async (activeChips: Chip[], text: string) => {
    setSearching(true);
    setResults([]);
    const val = (k: FilterKey) => activeChips.find((c) => c.key === k)?.value ?? null;
    const args = {
      p_q: text.trim() || null,
      p_from: val('from'), p_mentions: val('mentions'), p_has: val('has'),
      p_before: val('before'), p_after: val('after'), lim: 40,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = sbRef.current as any;
    try {
      const { data } = scope.kind === 'server'
        ? await sb.rpc('search_server_messages', { p_server_public_id: scope.id, ...args })
        : await sb.rpc('search_dm_messages', { p_route_id: 'id' in scope ? scope.id : '', ...args });
      setResults(Array.isArray(data) ? (data as MessageHit[]) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [scope]);

  const commit = useCallback(() => {
    // Fold any tokens typed directly into the text into chips first.
    const typed = parseToChips(query);
    const merged = [...chips];
    for (const c of typed.chips) if (!merged.some((m) => m.key === c.key)) merged.push(c);
    const text = typed.text;
    if (merged.length === 0 && !text.trim()) return;

    const str = serialize(merged, text);
    const next = [str, ...history.filter((h) => h !== str)].slice(0, HISTORY_MAX);
    setHistory(next);
    writeHistory(hKey, next);

    if (scope.kind === 'feed') {
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(str)}`);
      return;
    }
    setChips(merged);
    setQuery(text);
    void runSearch(merged, text);
  }, [query, chips, history, hKey, scope, router, runSearch]);

  function replayHistory(str: string) {
    const { chips: c, text } = parseToChips(str);
    setChips(c);
    setQuery(text);
    if (scope.kind === 'feed') { setOpen(false); router.push(`/search?q=${encodeURIComponent(str)}`); return; }
    void runSearch(c, text);
  }

  function clearHistory() { setHistory([]); writeHistory(hKey, []); }
  function removeHistory(item: string) {
    const next = history.filter((h) => h !== item);
    setHistory(next);
    writeHistory(hKey, next);
  }

  function clearAll() {
    setChips([]);
    setQuery('');
    setResults(null);
    setPicking(null);
    inputRef.current?.focus();
  }

  function openHit(hit: MessageHit) {
    setOpen(false);
    if (scope.kind === 'server' && hit.channel_public_id) {
      router.push(`/s/${scope.id}/${hit.channel_public_id}`);
    }
  }

  const q = query.trim().toLowerCase();
  const historyShown = q ? history.filter((h) => h.toLowerCase().includes(q)) : history;
  const showResults = results !== null;
  const showUserPicker = !showResults && (picking === 'from' || picking === 'mentions');
  const showHasPicker = !showResults && picking === 'has';
  const showDatePicker = !showResults && (picking === 'before' || picking === 'after');
  const peopleShown = showUserPicker
    ? people.filter((p) => !q || p.username.toLowerCase().includes(q) || (p.display_name ?? '').toLowerCase().includes(q))
    : [];
  const hasOptions = [
    { value: 'image', label: t('hasImage'), icon: ImageIcon },
    { value: 'video', label: t('hasVideo'), icon: Film },
    { value: 'link', label: t('hasLink'), icon: Link2 },
    { value: 'file', label: t('hasFile'), icon: FileText },
  ];

  return (
    <div ref={wrapRef} className="relative">
      {/* Input box: search icon + filter chips + free-text field. */}
      <div className="flex min-h-[38px] w-full flex-wrap items-center gap-1 rounded-xl bg-accent/60 px-2.5 py-1.5 text-sm transition-colors focus-within:bg-accent">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {chips.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pl-1.5 pr-1 text-[12px] font-medium">
            <span className="text-muted-foreground">{c.key}:</span>
            {c.user
              ? <span className="inline-flex items-center gap-1">
                  <span className="relative h-4 w-4 overflow-hidden rounded-full bg-link/20">
                    {c.user.avatar_url
                      ? <AvatarImage src={c.user.avatar_url} alt="" sizes="16px" className="object-cover" />
                      : <span className="flex h-full w-full items-center justify-center text-[8px] font-bold text-link">{(c.user.display_name ?? c.user.username)[0]?.toUpperCase() ?? '?'}</span>}
                  </span>
                  <span className="max-w-[120px] truncate text-foreground">{renderEmojiNodes(c.user.display_name ?? c.user.username)}</span>
                </span>
              : <span className="max-w-[140px] truncate text-foreground">{c.value}</span>}
            <button type="button" onClick={() => removeChip(c.key)} aria-label={t('clear')} className="ml-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setResults(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { setOpen(false); }
            else if (e.key === 'Backspace' && !query && chips.length) { setChips((prev) => prev.slice(0, -1)); }
          }}
          placeholder={chips.length ? '' : placeholder}
          className="min-w-[60px] flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/60 outline-none"
        />
        {(chips.length > 0 || query) && (
          <button type="button" onClick={clearAll} aria-label={t('clear')} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="surface-solid absolute right-0 top-[calc(100%+6px)] z-[9999] w-[340px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border shadow-lg animate-fade-in">
          <div className="max-h-[70vh] overflow-y-auto p-1.5">
            {showUserPicker ? (
              <>
                <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{t('people')}</span>
                  <button type="button" onClick={() => setPicking(null)} className="flex items-center gap-1 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" />{t('filters')}
                  </button>
                </div>
                {peopleShown.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted-foreground">{t('noResults')}</p>}
                {peopleShown.map((p) => (
                  <button
                    key={p.username + (p.self ? ':self' : '')}
                    type="button"
                    onClick={() => addChip(picking!, p.username, p)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-link/20">
                      {p.avatar_url
                        ? <AvatarImage src={p.avatar_url} alt="" sizes="28px" className="object-cover" />
                        : <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-link">{(p.display_name ?? p.username)[0]?.toUpperCase() ?? '?'}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                        <span className="truncate">{renderEmojiNodes(p.display_name ?? p.username)}</span>
                        {p.self && <span className="rounded bg-accent px-1 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{t('you')}</span>}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">@{p.username}</span>
                    </span>
                  </button>
                ))}
              </>
            ) : showHasPicker ? (
              <>
                <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{t('hasTitle')}</span>
                  <button type="button" onClick={() => setPicking(null)} className="flex items-center gap-1 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" />{t('filters')}
                  </button>
                </div>
                {hasOptions.map((o) => (
                  <button key={o.value} type="button" onClick={() => addChip('has', o.value)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent">
                    <o.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground">{o.label}</span>
                  </button>
                ))}
              </>
            ) : showDatePicker ? (
              <>
                <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    {picking === 'before' ? t('beforeTitle') : t('afterTitle')}
                  </span>
                  <button type="button" onClick={() => setPicking(null)} className="flex items-center gap-1 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" />{t('filters')}
                  </button>
                </div>
                <div className="px-2.5 py-2">
                  <input
                    type="date"
                    autoFocus
                    onChange={(e) => { if (e.target.value) addChip(picking!, e.target.value); }}
                    className="w-full rounded-lg border border-border/40 bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-link"
                  />
                </div>
              </>
            ) : showResults ? (
              <>
                <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{t('resultsTitle')}</span>
                  <button type="button" onClick={() => setResults(null)} className="flex items-center gap-1 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" />{t('filters')}
                  </button>
                </div>
                {searching && (
                  <div className="flex justify-center py-4">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-link border-t-transparent" />
                  </div>
                )}
                {!searching && results!.length === 0 && <p className="px-2.5 py-4 text-[13px] text-muted-foreground">{t('noResults')}</p>}
                {!searching && results!.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => openHit(hit)}
                    className={cn('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent', scope.kind === 'server' && hit.channel_public_id ? 'cursor-pointer' : 'cursor-default')}
                  >
                    <span className="relative mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-link/20">
                      {hit.sender_avatar_url
                        ? <AvatarImage src={hit.sender_avatar_url} alt="" sizes="28px" className="object-cover" />
                        : <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-link">{(hit.sender_display_name ?? hit.sender_username)[0]?.toUpperCase() ?? '?'}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[12px]">
                        <span className="truncate font-semibold text-foreground">{renderEmojiNodes(hit.sender_display_name ?? hit.sender_username)}</span>
                        {hit.channel_name && <span className="shrink-0 text-muted-foreground/60">#{hit.channel_name}</span>}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/50">{new Date(hit.created_at).toLocaleDateString()}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[13px] text-foreground/80">{hit.content}</span>
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{t('filters')}</p>
                {filters.map((f) => (
                  <button key={f.key} type="button" onClick={() => { setPicking(f.key); setResults(null); }} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent">
                    <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-foreground">{f.title}</span>
                      <span className="block text-[12px] text-muted-foreground">{f.hint}</span>
                    </span>
                  </button>
                ))}
                {!showMore && (
                  <button type="button" onClick={() => setShowMore(true)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent">
                    <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-foreground">{t('moreTitle')}</span>
                      <span className="block text-[12px] text-muted-foreground">{t('moreHint')}</span>
                    </span>
                  </button>
                )}

                {historyShown.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{t('history')}</span>
                      <button type="button" onClick={clearHistory} aria-label={t('clearHistory')} title={t('clearHistory')} className="text-muted-foreground/60 transition-colors hover:text-foreground">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {historyShown.map((h) => (
                      <div key={h} className="group/hist flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent">
                        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <button type="button" onClick={() => replayHistory(h)} className="min-w-0 flex-1 truncate text-left text-[13px] text-foreground">{h}</button>
                        <button type="button" onClick={() => removeHistory(h)} aria-label={t('clear')} className="shrink-0 text-muted-foreground/0 transition-colors group-hover/hist:text-muted-foreground/60 hover:!text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
