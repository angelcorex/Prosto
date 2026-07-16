import { NextResponse } from 'next/server';

import { limitRequest } from '@/lib/rate-limit/ip';
import { edgeGet } from '@/lib/edge/forward';

export interface GifItem {
  id: string;
  url: string;       // full-size gif to send
  preview: string;   // lightweight gif for the grid
  description: string;
}

/**
 * GIF search/trending — proxied through our server so the client never sees the
 * API key and we can swap providers without touching the picker.
 *
 * Provider: Giphy (Tenor's public API is now paid). Set GIPHY_API_KEY from
 * https://developers.giphy.com (free tier). Without a key we fall back to
 * Giphy's public beta key so GIFs still work out of the box in development.
 *
 * The response shape ({ results: GifItem[], next }) is provider-agnostic; the
 * `pos` param is an opaque pagination cursor (Giphy's numeric offset here).
 */

// Giphy's long-standing public beta key — rate-limited, fine for dev/demo.
const GIPHY_BETA_KEY = 'dc6zaTOxFJmzC';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGiphy(results: any[]): GifItem[] {
  return (results ?? []).map((r: any) => {
    const images = r.images ?? {};
    // Full (sent) GIF: prefer downsized to keep messages light, then fixed_height,
    // then original. Preview (grid thumbnail): the small fixed-width variant.
    // These render fields are always present (unlike bundle-restricted sets).
    const full = images.downsized?.url || images.fixed_height?.url || images.original?.url;
    const preview = images.fixed_width_small?.url || images.fixed_width_downsampled?.url
      || images.fixed_width?.url || full;
    return {
      id: String(r.id ?? ''),
      url: full ?? '',
      preview: preview ?? full ?? '',
      description: r.title ?? '',
    };
  }).filter((g: GifItem) => g.url);
}

export async function GET(request: Request) {
  const limited = limitRequest(request, 'gifs', 40, 10_000);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const q   = searchParams.get('q')?.trim() ?? '';
  const pos = searchParams.get('pos') ?? '';

  // Offload the Giphy fetch+map to the Go edge service when configured; falls
  // back to the in-process path below when it's unset/unreachable.
  const edge = await edgeGet('/gif', { q, pos });
  if (edge) return new NextResponse(edge.body, { status: edge.status, headers: { 'content-type': 'application/json' } });

  const key = process.env.GIPHY_API_KEY || GIPHY_BETA_KEY;
  const offset = /^\d+$/.test(pos) ? pos : '0';

  try {
    // No `bundle` — it strips the `downsized` render and other fields we map.
    const params = new URLSearchParams({
      api_key: key,
      limit: '24',
      offset,
      rating: 'pg-13',
    });
    // Search when there's a query; otherwise show trending.
    const endpoint = q
      ? `${GIPHY_BASE}/search?${params.toString()}&q=${encodeURIComponent(q)}`
      : `${GIPHY_BASE}/trending?${params.toString()}`;

    const res = await fetch(endpoint, { next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ results: [], next: '', error: 'giphy_error' });
    }
    const data = await res.json();
    const results = mapGiphy(data.data);
    // Next-page cursor: Giphy paginates by offset. Compute the next offset from
    // pagination info; empty string when there are no more results.
    const p = data.pagination ?? {};
    const nextOffset = Number(p.offset ?? 0) + Number(p.count ?? results.length);
    const next = nextOffset < Number(p.total_count ?? 0) ? String(nextOffset) : '';
    return NextResponse.json({ results, next });
  } catch {
    return NextResponse.json({ results: [], next: '', error: 'fetch_failed' });
  }
}
