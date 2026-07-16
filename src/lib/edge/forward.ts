import 'server-only';

/**
 * Optional offload to the Go/Gin edge service (`services/edge`).
 *
 * When `EDGE_SERVICE_URL` is set (e.g. http://127.0.0.1:8090), the heavy,
 * purely-computational routes (GIF proxy, link-preview) forward the request
 * there instead of running the fetch+parse in the Node process. When it's NOT
 * set, callers fall back to their existing in-process implementation — so this
 * is entirely additive and safe to ship before the Go service is deployed.
 *
 * The Next route KEEPS its auth-gate + per-IP rate limit in front of this call;
 * the edge service only does the outbound fetch + parsing (it touches no DB and
 * no user data), and re-applies the SSRF guard itself as defence in depth.
 */

const BASE = process.env.EDGE_SERVICE_URL?.replace(/\/+$/, '') || '';

/** True when an edge service is configured. */
export function edgeEnabled(): boolean {
  return BASE.length > 0;
}

/**
 * Forward a GET to the edge service and return its Response verbatim, or null
 * when the edge is unconfigured / unreachable (caller then does it in-process).
 * `path` is like `/gif` or `/link-preview`; `params` becomes the query string.
 */
export async function edgeGet(
  path: string,
  params: Record<string, string>,
  timeoutMs = 8000,
): Promise<Response | null> {
  if (!BASE) return null;
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      // Never cache at the fetch layer — the edge sets its own cache-control.
      cache: 'no-store',
    });
    // Only trust a real response; on 5xx from the edge, fall back in-process.
    if (res.status >= 500) return null;
    return res;
  } catch {
    return null; // unreachable / timeout → in-process fallback
  }
}
