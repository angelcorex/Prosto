/*
 * Prosto service worker — installability + fast static assets.
 *
 * Deliberately conservative: it ONLY touches same-origin GET requests for
 * static assets (Next build output, icons, fonts, images). Everything else —
 * navigations, API calls, Supabase, realtime — is passed straight through so
 * auth, live messages and SSR are never served stale.
 */

const CACHE = 'prosto-static-v1';

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
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
