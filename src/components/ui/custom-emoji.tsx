'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { createClient } from '@/lib/supabase/client';
import { joinPublicServer } from '@/features/servers/actions';
import { getEmojiById, getEmojiByName, fetchEmojiById, findServerByEmojiUrl, subscribeEmojis, getEmojiVersion } from '@/lib/emoji';

// useLayoutEffect on the client (fires before paint → no flash), useEffect on
// the server (no-op, avoids the SSR warning).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ─────────────────────────────────────────────────────────────────────────
 * Custom server emoji rendering — shared by chat, posts, bios and nicknames.
 *
 * Token format (Discord-style, id-based): `<:name:id>` (static) or
 * `<a:name:id>` (animated). Legacy url-based tokens (`<:name:https://…>`) are
 * still understood for backward compatibility. The payload after the second
 * colon is either an emoji id (resolved to an image via the emoji registry) or
 * a direct image URL.
 * ──────────────────────────────────────────────────────────────────────── */

/** Regex source for a single custom-emoji token (payload = id OR url). */
export const CUSTOM_EMOJI_SRC = '<a?:[a-z0-9_]{2,32}:[^\\s>]+>';
/** Regex source for any Unicode emoji (incl. flags + ZWJ sequences).
 *  All inner groups are NON-capturing on purpose: this source gets embedded in
 *  larger alternations (see emoji-text.tsx) that rely on fixed capture-group
 *  indices. A capturing group here would shift those indices and silently break
 *  custom-emoji rendering. */
export const UNICODE_EMOJI_SRC =
  '[\\u{1F1E6}-\\u{1F1FF}]{2}|\\p{Extended_Pictographic}(?:\\uFE0F)?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F)?)*(?:\\u20E3)?';

/** Parse a `<a?:name:payload>` token into its parts (null if malformed). */
export function parseEmojiToken(token: string): { animated: boolean; name: string; payload: string } | null {
  const m = token.match(/^<(a)?:([a-z0-9_]{2,32}):([^\s>]+)>$/i);
  if (!m) return null;
  return { animated: !!m[1], name: m[2]!, payload: m[3]! };
}

/**
 * Build the canonical, pasteable token for a custom emoji — `<:name:id>` or
 * `<a:name:id>` — keyed by its short snowflake public_id (falling back to the
 * image url for legacy emojis without one). This is what the picker inserts and
 * what renders as the emoji anywhere (chat, posts, bios, nicknames, reactions).
 */
export function buildEmojiToken(e: { name: string; public_id?: string | null; url: string; is_animated?: boolean }): string {
  const payload = e.public_id || e.url;
  return `<${e.is_animated ? 'a' : ''}:${e.name}:${payload}>`;
}

/** Resolve a token payload (id or url) to an image URL, fetching by id on
 *  demand for emojis from servers the viewer isn't in. Returns the resolved
 *  emoji metadata plus the pasteable canonical token. */
function useResolvedEmoji(name: string, payload: string, animated: boolean) {
  const isUrl = /^https?:\/\//i.test(payload);
  // Re-render whenever the registry gains emojis so a token that couldn't
  // resolve yet (its server still loading) resolves the instant it can —
  // getServerSnapshot returns 0 so SSR + first hydration render stay identical.
  const version = useSyncExternalStore(subscribeEmojis, getEmojiVersion, () => 0);

  // Hydration-safety: the emoji registry is a client-only store, empty during
  // SSR but usually populated on the client. Reading it in the initial useState
  // would make the first client render (an <img>) differ from the server render
  // (the `:name:` fallback) → hydration mismatch. So the initial value is
  // registry-independent: a direct-url payload is known up front; an id payload
  // starts unresolved and is filled in below.
  const [url, setUrl] = useState<string | null>(isUrl ? payload : null);
  const [id, setId] = useState<string | null>(isUrl ? null : payload);

  // Resolve from the registry BEFORE the browser paints (no visible `:name:`
  // flash for emojis that are already loaded). The first render still emits the
  // fallback to match SSR; this layout effect swaps in the image pre-paint, and
  // re-runs on `version` changes so a late-loading server resolves immediately.
  useIsoLayoutEffect(() => {
    if (isUrl) return;
    const cached = getEmojiById(payload) ?? getEmojiByName(name);
    if (cached) {
      setUrl(cached.url);
      setId(cached.public_id || cached.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, isUrl, name, version]);

  // Still unresolved → fetch by id (async) for emojis from servers the viewer
  // isn't in. Skips when the registry already has it (the layout effect wins).
  useEffect(() => {
    if (isUrl || url) return;
    if (getEmojiById(payload) ?? getEmojiByName(name)) return;
    let cancelled = false;
    void fetchEmojiById(payload).then((e) => {
      if (cancelled) return;
      const found = e ?? getEmojiByName(name);
      if (!found) return;
      setUrl(found.url);
      setId(found.public_id || found.id);
    });
    return () => { cancelled = true; };
  }, [payload, isUrl, url, name]);

  // Canonical, pasteable token. Prefer id form; fall back to the raw payload.
  const token = `<${animated ? 'a' : ''}:${name}:${id ?? payload}>`;
  return { url, id, token };
}

/** Right-click menu: copy the pasteable token or the raw id/url. */
function CopyMenu({ x, y, token, rawId, onClose }: { x: number; y: number; token: string; rawId: string; onClose: () => void }) {
  const t = useT('servers');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useLayoutEffect(() => {
    const W = ref.current?.offsetWidth ?? 180;
    const H = ref.current?.offsetHeight ?? 80;
    const left = Math.min(x, window.innerWidth - W - 8);
    const top = Math.min(y, window.innerHeight - H - 8);
    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, [x, y]);

  useEffect(() => {
    function onOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onOutside); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setDone(label);
    setTimeout(onClose, 650);
  }

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', top: pos?.top ?? -9999, left: pos?.left ?? -9999, zIndex: 10000, visibility: pos ? 'visible' : 'hidden' }}
      className="surface-solid min-w-[170px] overflow-hidden rounded-xl border border-border py-1 shadow-2xl animate-fade-in"
    >
      {done ? (
        <div className="px-3 py-2 text-[13px] text-muted-foreground">{t('copied')}</div>
      ) : (
        <>
          <button type="button" onClick={() => copy(token, 'emoji')} className="block w-full px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent">
            {t('copyEmoji')}
          </button>
          <button type="button" onClick={() => copy(rawId, 'id')} className="block w-full px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent">
            {t('copyEmojiId')}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * One rendered custom emoji.
 *
 * - Left click (when `interactive`) opens a server-info popup.
 * - Right click opens a copy menu (token / id) so the emoji can be reused
 *   anywhere — channels, bios, nicknames.
 * - `alt` is the `:name:` shortcode, so copying surrounding text yields a
 *   shortcode the composer re-expands on send.
 */
export function CustomEmoji({
  name, payload, animated = false, jumbo = false, interactive = true, className,
}: {
  name: string; payload: string; animated?: boolean; jumbo?: boolean; interactive?: boolean; className?: string;
}) {
  const { url, id, token } = useResolvedEmoji(name, payload, animated);
  const ref = useRef<HTMLSpanElement>(null);
  const [popup, setPopup] = useState<DOMRect | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Unresolved (registry not loaded / unknown id) → fall back to the shortcode.
  if (!url) return <span title={`:${name}:`}>{`:${name}:`}</span>;

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        title={`:${name}:`}
        onClick={interactive ? () => setPopup(ref.current?.getBoundingClientRect() ?? null) : undefined}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
        onKeyDown={(e) => { if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPopup(ref.current?.getBoundingClientRect() ?? null); } }}
        className={cn('inline-flex items-center align-[-0.2em] outline-none', interactive && 'cursor-pointer')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`:${name}:`}
          draggable={false}
          className={cn('inline-block object-contain', interactive && 'transition-opacity hover:opacity-80', jumbo ? 'h-11 w-11' : 'h-[1.3em] w-[1.3em]', className)}
        />
      </span>
      {popup && interactive && typeof document !== 'undefined' && createPortal(
        <ServerEmojiPopup name={name} url={url} triggerRect={popup} onClose={() => setPopup(null)} />,
        document.body,
      )}
      {menu && typeof document !== 'undefined' && createPortal(
        <CopyMenu x={menu.x} y={menu.y} token={token} rawId={id ?? payload} onClose={() => setMenu(null)} />,
        document.body,
      )}
    </>
  );
}

/* ── Server-info popup (opened by clicking a custom emoji in chat) ── */

interface ServerInfo {
  id: string; public_id: string; name: string; icon_url: string | null;
  member_count: number; online_count: number; is_member: boolean; is_public: boolean;
}

function ServerEmojiPopup({ name, url, triggerRect, onClose }: { name: string; url: string; triggerRect: DOMRect | null; onClose: () => void }) {
  const t = useT('servers');
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [joining, setJoining] = useState(false);
  const [server, setServer] = useState<ServerInfo | null | undefined>(undefined);

  useLayoutEffect(() => {
    if (!triggerRect || !ref.current) return;
    const popup = ref.current.getBoundingClientRect();
    const W = popup.width || 260;
    const H = popup.height || 200;
    const gap = 8;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = triggerRect.bottom + gap;
    if (top + H > vh - margin) top = triggerRect.top - H - gap;
    if (top < margin) top = margin;

    let left = triggerRect.left;
    if (left + W > vw - margin) left = vw - W - margin;
    if (left < margin) left = margin;

    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, [triggerRect, server]);

  useEffect(() => {
    const cached = findServerByEmojiUrl(url);
    if (cached) {
      setServer({ ...cached, is_member: true, is_public: true });
      return;
    }
    let cancelled = false;
    async function fetchInfo() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (createClient() as any).rpc('get_server_by_emoji_url', { p_url: url });
        if (!cancelled) setServer(data?.[0] ?? null);
      } catch {
        if (!cancelled) setServer(null);
      }
    }
    void fetchInfo();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    function onOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onOutside); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  async function handleAction() {
    if (!server?.public_id) return;
    if (server.is_member) {
      onClose();
      router.push(`/s/${server.public_id}`);
      return;
    }
    setJoining(true);
    const res = await joinPublicServer(server.public_id);
    setJoining(false);
    onClose();
    if ('publicId' in res || 'data' in res) router.push(`/s/${server.public_id}`);
  }

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', top: pos?.top ?? -9999, left: pos?.left ?? -9999, zIndex: 9999, visibility: pos ? 'visible' : 'hidden' }}
      className="surface-solid w-[260px] overflow-hidden rounded-2xl border border-border shadow-2xl animate-fade-in"
    >
      <div className="flex items-center gap-3 border-b border-border/50 px-3 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`:${name}:`} className="h-10 w-10 shrink-0 object-contain" draggable={false} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">:{name}:</p>
          {server && <p className="truncate text-[11px] text-muted-foreground">{server.name}</p>}
        </div>
      </div>

      {server === undefined ? (
        <div className="flex items-center justify-center px-3 py-4">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-link" />
        </div>
      ) : server === null ? (
        <p className="px-3 py-3 text-[12px] text-muted-foreground">{name}</p>
      ) : (
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            {server.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={server.icon_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-[16px] font-bold text-foreground">
                {server.name[0]?.toUpperCase() ?? '?'}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-foreground leading-tight">{server.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t('membersOnline').replace('{online}', String(server.online_count)).replace('{total}', String(server.member_count))}
              </p>
            </div>
          </div>

          {(server.is_member || server.is_public) && (
            <div className="px-3 pb-3">
              <button
                type="button"
                onClick={handleAction}
                disabled={joining}
                className="w-full rounded-xl bg-link py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {joining ? '…' : t(server.is_member ? 'goToServer' : 'join')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
