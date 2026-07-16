'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { twemojiUrl } from '@/lib/utils/twemoji';
import { Tooltip } from './tooltip';
import { buildEmojiToken } from './custom-emoji';
import { getAllServerEmojiGroups, loadServerEmojis, ensureEmojiServersLoaded, type ServerEmoji, type ServerEmojiGroup } from '@/lib/emoji';

/* ── Emoji data (loaded lazily from @emoji-mart/data; curated fallback) ── */
interface MartData {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<string, { id: string; name: string; keywords: string[]; skins: { native: string }[] }>;
}
let cachedData: MartData | null = null;
export async function loadMart(): Promise<MartData | null> {
  if (cachedData) return cachedData;
  try {
    const mod = await import('@emoji-mart/data');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cachedData = ((mod as any).default ?? mod) as MartData;
    return cachedData;
  } catch {
    return null;
  }
}

/** Preload the emoji dataset ahead of time (called on app entry, on idle). */
export function preloadEmojiData(): void {
  if (cachedData) return;
  void loadMart();
}

/** Reverse lookup: a Unicode emoji's human name from the dataset (or null if
 *  the dataset hasn't loaded yet / the glyph is unknown). Used to label
 *  reactions on hover, matching the picker's `:name:` tooltip. */
let nameByNative: Map<string, string> | null = null;
export function emojiName(native: string): string | null {
  if (!cachedData) return null;
  if (!nameByNative) {
    nameByNative = new Map();
    for (const key in cachedData.emojis) {
      const e = cachedData.emojis[key];
      const n = e?.skins?.[0]?.native;
      if (e && n) nameByNative.set(n, e.name);
    }
  }
  return nameByNative.get(native) ?? null;
}

/** Representative emoji glyph + label per category (rail icons use the glyph). */
const CAT_META: Record<string, { glyph: string; label: string }> = {
  frequent: { glyph: '🕒', label: 'Часто' },
  people:   { glyph: '😀', label: 'Смайлы и люди' },
  nature:   { glyph: '🐻', label: 'Природа' },
  foods:    { glyph: '🍔', label: 'Еда' },
  activity: { glyph: '⚽', label: 'Активность' },
  places:   { glyph: '✈️', label: 'Места' },
  objects:  { glyph: '💡', label: 'Объекты' },
  symbols:  { glyph: '❤️', label: 'Символы' },
  flags:    { glyph: '🏁', label: 'Флаги' },
};

/* Fallback categories used until the data package loads (or if it's absent). */
const FALLBACK: { id: string; label: string; glyph: string; emojis: string[] }[] = [
  { id: 'people', label: 'Смайлы', glyph: '😀', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😔','😟','🙁','😣','😫','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','🤗','🤔','🤭','🤫','😶','😐','😴','🤤','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👻','💀','👽','🤖','💩','🤡'] },
  { id: 'gestures', label: 'Жесты', glyph: '👍', emojis: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','🙏','💪','👏','🙌','👐','🤲','🫶','👀','🧠'] },
  { id: 'symbols', label: 'Сердца', glyph: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'] },
  { id: 'nature', label: 'Животные', glyph: '🐻', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🦄','🐢','🐍','🦋','🐝','🐙','🦈','🐬','🌸','🌹','🌻','🌈','⚡','🔥','💧'] },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  /** The active server (its emojis are force-refreshed on open). Server emojis
   *  from every joined server are usable everywhere regardless of this. */
  serverId?: string;
  /** Class for the trigger button. Defaults to `inline-flex`; pass e.g.
   *  `w-full` to use the picker as a full-width menu row. */
  className?: string;
  /** Native tooltip for the trigger button. */
  title?: string;
  children: React.ReactNode;
}

export function EmojiPicker({ onSelect, serverId, className, title, children }: EmojiPickerProps) {
  const [open, setOpen]     = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [ready, setReady]   = useState(false);
  const [mart, setMart]     = useState<MartData | null>(cachedData);
  const [query, setQuery]   = useState('');
  const [groups, setGroups] = useState<ServerEmojiGroup[]>(getAllServerEmojiGroups());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const loadServer = useCallback(async () => {
    setGroups(getAllServerEmojiGroups());
    // Ensure every server the user is in has its emojis loaded — even from a
    // DM/feed or before the app-entry prefetch ran (self-registers if needed).
    // This is what makes custom emojis usable from any of your servers.
    await ensureEmojiServersLoaded();
    if (serverId) {
      // Force-refresh the active server's emojis in case they changed.
      await loadServerEmojis(serverId, true).catch(() => {});
    }
    setGroups(getAllServerEmojiGroups());
  }, [serverId]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const W = 380, H = 440;
    let left = rect.right - W + window.scrollX;
    if (left < 8) left = 8;
    let top = rect.top - H - 8 + window.scrollY;
    if (rect.top - H - 8 < 8) top = rect.bottom + 8 + window.scrollY;
    setCoords({ top, left });
    setReady(true);
  }, [open]);

  useEffect(() => {
    if (!open) { setReady(false); return; }
    setQuery('');
    loadServer();
    if (!cachedData) loadMart().then((d) => d && setMart(d));
  }, [open, loadServer]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onOutside); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Build the ordered category sections from the loaded data (or fallback).
  const sections = useMemo(() => {
    if (mart) {
      return mart.categories
        .filter((c) => c.id !== 'frequent' && c.emojis.length)
        .map((c) => ({
          id: c.id,
          label: CAT_META[c.id]?.label ?? c.id,
          glyph: CAT_META[c.id]?.glyph ?? '🙂',
          emojis: c.emojis
            .map((eid) => {
              const e = mart.emojis[eid];
              const native = e?.skins?.[0]?.native;
              return native ? { native, name: e!.name } : null;
            })
            .filter(Boolean) as { native: string; name: string }[],
        }));
    }
    return FALLBACK.map((f) => ({ ...f, emojis: f.emojis.map((native) => ({ native, name: native })) }));
  }, [mart]);

  // Search across names/keywords (data) or just skip when only fallback.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const found: { native: string; name: string }[] = [];
    if (mart) {
      for (const id in mart.emojis) {
        const e = mart.emojis[id]!;
        if (e.name.toLowerCase().includes(q) || e.keywords.some((k) => k.includes(q))) {
          const n = e.skins?.[0]?.native;
          if (n) found.push({ native: n, name: e.name });
        }
        if (found.length >= 120) break;
      }
    }
    return found;
  }, [query, mart]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, emojis: g.emojis.filter((e) => e.name.toLowerCase().includes(q)) }))
      .filter((g) => g.emojis.length > 0);
  }, [query, groups]);

  function scrollTo(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  const searching = query.trim().length > 0;

  return (
    <>
      <button ref={triggerRef} type="button" title={title} onClick={() => setOpen(v => !v)} className={className ?? 'inline-flex'}>
        {children}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999, transformOrigin: 'bottom right', visibility: ready ? 'visible' : 'hidden' }}
          className="surface-solid flex h-[440px] w-[380px] overflow-hidden rounded-2xl border border-border shadow-2xl animate-profile-pop"
        >
          {/* ── Left rail: servers + category jump ── */}
          <div className="flex w-[44px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/40 bg-background/40 py-2">
            {groups.length > 0 && (
              <>
                {groups.map((g) => (
                  <button
                    key={g.server.id}
                    type="button"
                    title={g.server.name}
                    onClick={() => scrollTo(`server-${g.server.id}`)}
                    className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg text-muted-foreground transition-colors hover:bg-accent"
                  >
                    {g.server.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.server.icon_url} alt="" className="h-7 w-7 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[12px] font-bold text-foreground">
                        {g.server.name[0]?.toUpperCase() ?? '?'}
                      </span>
                    )}
                  </button>
                ))}
                <span className="my-0.5 h-px w-6 bg-border/50" />
              </>
            )}
            {sections.map((s, i) => (
              <button
                key={`${s.id}-${i}`}
                type="button"
                title={s.label}
                onClick={() => scrollTo(`${s.id}-${i}`)}
                className="flex h-9 w-9 items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={twemojiUrl(s.glyph)} alt={s.label} className="h-full w-full object-contain opacity-80" draggable={false} />
              </button>
            ))}
          </div>

          {/* ── Main column ── */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Search */}
            <div className="shrink-0 p-2.5">
              <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-2.5 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Найти эмодзи"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
              </div>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {searching ? (
                <>
                  {filteredGroups.map((g) => (
                    <Section key={g.server.id} title={g.server.name} icon={g.server.icon_url} fallback={g.server.name[0]}>
                      {g.emojis.map((e) => <ServerBtn key={e.id} e={e} onPick={() => { onSelect(buildEmojiToken(e)); setOpen(false); }} />)}
                    </Section>
                  ))}
                  {results && results.length > 0 ? (
                    <Section title="Результаты">
                      {results.map((e, i) => <EmojiBtn key={`r${i}`} native={e.native} name={e.name} onPick={() => { onSelect(e.native); setOpen(false); }} />)}
                    </Section>
                  ) : (
                    filteredGroups.length === 0 && <p className="px-2 py-8 text-center text-[13px] text-muted-foreground/60">Ничего не найдено</p>
                  )}
                </>
              ) : (
                <>
                  {groups.map((g) => (
                    <div key={g.server.id} ref={(el) => { sectionRefs.current[`server-${g.server.id}`] = el; }}>
                      <Section title={g.server.name} icon={g.server.icon_url} fallback={g.server.name[0]}>
                        {g.emojis.map((e) => <ServerBtn key={e.id} e={e} onPick={() => { onSelect(buildEmojiToken(e)); setOpen(false); }} />)}
                      </Section>
                    </div>
                  ))}
                  {sections.map((s, i) => (
                    <div key={`${s.id}-${i}`} ref={(el) => { sectionRefs.current[`${s.id}-${i}`] = el; }}>
                      <Section title={s.label}>
                        {s.emojis.map((e, j) => <EmojiBtn key={`${i}-${j}`} native={e.native} name={e.name} onPick={() => { onSelect(e.native); setOpen(false); }} />)}
                      </Section>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Section({ title, icon, fallback, children }: { title: string; icon?: string | null; fallback?: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="sticky top-0 z-10 flex items-center gap-1.5 bg-card/95 px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50 backdrop-blur-sm">
        {icon !== undefined && (
          icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" className="h-4 w-4 rounded-sm object-cover" />
          ) : (
            <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-accent text-[8px] font-bold text-foreground">{fallback?.[0]?.toUpperCase() ?? '?'}</span>
          )
        )}
        <span className="truncate">{title}</span>
      </p>
      <div className="grid grid-cols-7 gap-0.5">{children}</div>
    </div>
  );
}

function EmojiBtn({ native, name, onPick }: { native: string; name: string; onPick: () => void }) {
  return (
    <Tooltip content={<span className="font-normal normal-case tracking-normal">:{name}:</span>} side="top">
      <button type="button" onClick={onPick} className={cn('flex h-11 w-11 items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-accent')}>
        {/* Vendored Twemoji are same-origin (see NEXT_PUBLIC_TWEMOJI_BASE) so they
            load effectively instantly — NOT lazy, otherwise the first open shows
            the alt glyph (raw unicode) until each PNG scrolls into view. `alt=""`
            keeps a failed/pending image from flashing the unicode character. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={twemojiUrl(native)} alt="" className="h-full w-full object-contain" draggable={false} />
      </button>
    </Tooltip>
  );
}

function ServerBtn({ e, onPick }: { e: ServerEmoji; onPick: () => void }) {
  return (
    <Tooltip content={<span className="font-normal normal-case tracking-normal">:{e.name}:</span>} side="top">
      <button type="button" onClick={onPick} className="flex h-11 w-11 items-center justify-center rounded-lg p-1 transition-colors hover:bg-accent">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.url} alt={e.name} className="max-h-full max-w-full object-contain" draggable={false} />
      </button>
    </Tooltip>
  );
}
