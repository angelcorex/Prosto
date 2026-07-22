/*
 * Prosto service worker — installability + fast static assets.
 *
 * Deliberately conservative: it ONLY touches same-origin GET requests for
 * static assets (Next build output, icons, fonts, images). Everything else —
 * navigations, API calls, Supabase, realtime — is passed straight through so
 * auth, live messages and SSR are never served stale.
 */

// Bump this whenever the caching rules change. Bumping also drops any cache a
// previous version may have poisoned with a stale/mistyped response (see
// `responseTypeMatches` below), because `activate` deletes every non-current
// cache.
const CACHE = 'prosto-static-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/favicon/') ||
    url.pathname.startsWith('/material/') ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|ico|mp3)$/i.test(url.pathname)
  );
}

// Guard against cache poisoning. After a redeploy, a request for a PREVIOUS
// build's chunk can be answered by the app's HTML not-found page
// (`Content-Type: text/html`). Storing or serving that HTML under a `.js`/`.css`
// URL would break the page permanently (the browser blocks it via `nosniff`).
// So for scripts/styles we require a matching content type; other assets
// (images, fonts, audio) are accepted as-is. Returning false here means "don't
// cache and don't treat as a valid asset" — the client's ChunkReloadGuard then
// recovers by reloading onto the current build.
function responseTypeMatches(url, res) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (url.pathname.startsWith('/_next/static/chunks/') || /\.(?:js|mjs)$/i.test(url.pathname)) {
    return ct.includes('javascript') || ct.includes('ecmascript');
  }
  if (/\.css$/i.test(url.pathname)) {
    return ct.includes('text/css');
  }
  return true;
}

function isCacheable(url, res) {
  return !!res && res.status === 200 && res.type === 'basic' && responseTypeMatches(url, res);
}

// ── Web Push ──────────────────────────────────────────────────────────────
// Show a notification even when the app is closed. The server sends a JSON
// payload { title, body, icon, url, tag }. Clicking focuses an existing tab and
// navigates it (or opens a new one) to `url`.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text ? event.data.text() : '' };
  }
  const title = data.title || 'Prosto';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon/prosto_logo.png',
    badge: '/favicon/prosto_icon.ico',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab on our origin and route it there.
      for (const client of clients) {
        if (client.url && client.url.startsWith(self.location.origin)) {
          client.focus();
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only same-origin static assets. Leave navigations and APIs untouched.
  if (url.origin !== self.location.origin || !isStaticAsset(url)) return;

  // Stale-while-revalidate: serve cache instantly, refresh in the background.
  // Only VALID, correctly-typed responses are ever stored (see isCacheable), so
  // an HTML fallback served for a missing chunk can never poison the cache.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) {
        // Refresh in the background; keep the good cached copy meanwhile.
        event.waitUntil(
          fetch(req)
            .then((res) => { if (isCacheable(url, res)) return cache.put(req, res.clone()); })
            .catch(() => {}),
        );
        return cached;
      }
      // Nothing cached yet — go to network. Cache only valid, correctly-typed
      // responses; otherwise pass the response straight through so a mistyped
      // chunk (HTML) surfaces as a load error the app can recover from.
      const res = await fetch(req);
      if (isCacheable(url, res)) cache.put(req, res.clone());
      return res;
    }),
  );
});
