import { NextResponse } from 'next/server';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

import { limitRequest } from '@/lib/rate-limit/ip';
import { getCurrentUser } from '@/lib/supabase/server';
import { edgeGet } from '@/lib/edge/forward';
import type { LinkPreviewData } from '@/lib/link-preview/types';

/**
 * Link-preview metadata fetcher (OpenGraph / Twitter cards).
 *
 * Fetches a user-supplied URL SERVER-SIDE and returns its title/description/
 * image so the client can render a Discord-style embed card. Because the URL is
 * fully attacker-controlled, this is an SSRF-sensitive endpoint and is hardened
 * accordingly:
 *   • auth-gated (only logged-in users) + per-IP rate limited;
 *   • http(s) only, standard ports only;
 *   • every hop (including redirects, followed MANUALLY) is re-validated: the
 *     host must resolve to a PUBLIC unicast address — never loopback, private,
 *     link-local, CGNAT, ULA or the cloud metadata IP (169.254.169.254);
 *   • hard timeout + response-size cap + HTML-only content-type;
 *   • only a small allow-list of meta tags is parsed and returned.
 *
 * It never proxies the target body to the client and never returns anything but
 * the parsed metadata, so it can't be used as an open proxy.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024;   // 512 KB of HTML is plenty for <head> metadata
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;
const CACHE_TTL_MS = 15 * 60 * 1000;
const UA = 'ProstoBot/1.0 (+https://prosto.ink; link-preview)';

// Small in-process LRU-ish cache (bounded) so repeated links (a video shared in
// several chats) don't refetch. Keyed by the requested URL.
const cache = new Map<string, { at: number; data: LinkPreviewData | null }>();
function cacheGet(key: string): LinkPreviewData | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return hit.data;
}
function cacheSet(key: string, data: LinkPreviewData | null): void {
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), data });
}

/** True for any IP literal that must never be fetched (SSRF guard). */
function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true;              // this-net, private, loopback
    if (a === 169 && b === 254) return true;                        // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;               // private
    if (a === 192 && b === 168) return true;                        // private
    if (a === 100 && b >= 64 && b <= 127) return true;              // CGNAT
    if (a >= 224) return true;                                      // multicast + reserved
    return false;
  }
  if (v === 6) {
    const ip6 = ip.toLowerCase();
    if (ip6 === '::1' || ip6 === '::') return true;                 // loopback / unspecified
    if (ip6.startsWith('fe80') || ip6.startsWith('fc') || ip6.startsWith('fd')) return true; // link-local + ULA
    // IPv4-mapped (::ffff:a.b.c.d) → validate the embedded v4.
    const mapped = ip6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]!);
    return false;
  }
  return true; // not a valid IP literal → refuse
}

/** Resolve a hostname and ensure EVERY resolved address is public. */
async function hostIsPublic(hostname: string): Promise<boolean> {
  // A bare IP host: validate directly.
  if (isIP(hostname)) return !isBlockedIp(hostname);
  try {
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !isBlockedIp(r.address));
  } catch {
    return false;
  }
}

/** Validate a candidate URL for fetching (scheme, port, public host). */
async function validateTarget(raw: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  // Only default / common web ports — refuse odd ports (SSRF into internal svcs).
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return null;
  if (u.username || u.password) return null; // no creds in URL
  if (!(await hostIsPublic(u.hostname))) return null;
  return u;
}

/** Decode HTML entities in a meta value (enough for titles/descriptions). */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .trim();
}

/** Read a <meta property|name="key" content="…"> value (either attr order). */
function metaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // content before key, or key before content — try both.
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*\\scontent=["']([^"']*)["']`, 'i'));
  if (a?.[1]) return decodeEntities(a[1]);
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`, 'i'));
  if (b?.[1]) return decodeEntities(b[1]);
  return null;
}

/** Parse the allow-listed metadata out of an HTML string. */
function parseMeta(html: string, finalUrl: URL): LinkPreviewData {
  const title =
    metaContent(html, 'og:title') ??
    metaContent(html, 'twitter:title') ??
    (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]!) : null);
  const description =
    metaContent(html, 'og:description') ??
    metaContent(html, 'twitter:description') ??
    metaContent(html, 'description');
  const rawImage =
    metaContent(html, 'og:image:secure_url') ??
    metaContent(html, 'og:image') ??
    metaContent(html, 'twitter:image') ??
    metaContent(html, 'twitter:image:src');
  const siteName = metaContent(html, 'og:site_name') ?? finalUrl.hostname.replace(/^www\./, '');

  // Resolve a possibly-relative image URL against the final page URL, and only
  // keep it if it's an absolute http(s) URL (the client loads it directly).
  let image: string | null = null;
  if (rawImage) {
    try {
      const abs = new URL(rawImage, finalUrl);
      if (abs.protocol === 'http:' || abs.protocol === 'https:') image = abs.toString();
    } catch { /* ignore bad image URL */ }
  }

  const clip = (s: string | null, n: number) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);
  return {
    url: finalUrl.toString(),
    title: clip(title, 300),
    description: clip(description, 500),
    image,
    siteName: clip(siteName, 100),
  };
}

/** Fetch + parse metadata, following redirects manually with per-hop checks. */
async function fetchPreview(startUrl: URL): Promise<LinkPreviewData | null> {
  let current: URL | null = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS && current; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);

    // Manual redirect: re-validate the next hop (defeats redirect-to-internal SSRF).
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      let next: URL;
      try { next = new URL(loc, current); } catch { return null; }
      current = await validateTarget(next.toString());
      continue;
    }

    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml\+xml/i.test(ctype)) return null;

    // Read at most MAX_BYTES so a huge/streaming body can't exhaust memory.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); total += value.length; }
    }
    try { await reader.cancel(); } catch { /* already closed */ }
    const html = new TextDecoder('utf-8').decode(concat(chunks, Math.min(total, MAX_BYTES)));
    return parseMeta(html, new URL(res.url || current.toString()));
  }
  return null; // too many redirects
}

function concat(chunks: Uint8Array[], len: number): Uint8Array {
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    if (off >= len) break;
    const take = Math.min(c.length, len - off);
    out.set(take === c.length ? c : c.subarray(0, take), off);
    off += take;
  }
  return out;
}

export async function GET(request: Request) {
  const limited = limitRequest(request, 'link-preview', 30, 10_000);
  if (limited) return limited;

  // Auth-gate: only logged-in users can trigger server-side fetches.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = new URL(request.url).searchParams.get('url')?.trim() ?? '';
  if (!raw || raw.length > 2048) return NextResponse.json({ error: 'bad_url' }, { status: 400 });

  // Offload the fetch+OG-parse to the Go edge service when configured (auth +
  // rate-limit above already passed). Falls back to the in-process path when
  // unset/unreachable. The edge re-applies the SSRF guard as defence in depth.
  const edge = await edgeGet('/link-preview', { url: raw });
  if (edge) {
    return new NextResponse(edge.body, {
      status: edge.status,
      headers: { 'content-type': 'application/json', 'cache-control': edge.headers.get('cache-control') ?? 'no-store' },
    });
  }

  const cached = cacheGet(raw);
  if (cached !== undefined) {
    return cached
      ? NextResponse.json(cached, { headers: { 'cache-control': 'private, max-age=900' } })
      : NextResponse.json({ error: 'no_preview' }, { status: 404 });
  }

  const target = await validateTarget(raw);
  if (!target) {
    cacheSet(raw, null);
    return NextResponse.json({ error: 'bad_url' }, { status: 400 });
  }

  const data = await fetchPreview(target);
  cacheSet(raw, data);
  if (!data || (!data.title && !data.description && !data.image)) {
    return NextResponse.json({ error: 'no_preview' }, { status: 404 });
  }
  return NextResponse.json(data, { headers: { 'cache-control': 'private, max-age=900' } });
}
