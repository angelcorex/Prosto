import { site } from '@/config';

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

/**
 * The public origin the browser actually used.
 *
 * Behind the nginx reverse proxy the Node server binds to localhost:3000, so
 * `new URL(request.url).origin` resolves to `http://localhost:3000` — using it
 * for a redirect would bounce authenticated users to a dead localhost address.
 *
 * We trust the proxy's forwarded headers first; if they're absent in
 * production we fall back to the canonical {@link site.url} rather than a
 * localhost origin. In local development (no proxy) the real localhost origin
 * is returned so the flow still works.
 */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${forwardedHost}`;
  }
  if (LOCAL_HOST_RE.test(url.host) && process.env.NODE_ENV === 'production') return site.url;
  return url.origin;
}
