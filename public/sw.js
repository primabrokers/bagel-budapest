/* Bar Mitzvah Planner — Service Worker (PWA + Update Detection) */

// __BUILD_VERSION__ is replaced with a unique per-build value by scripts/stamp-sw.cjs (run
// after `vite build`; scripts/swVersionPlugin.ts stamps a timestamp first during local dev
// builds). This makes sw.js change on every deploy so the browser detects a new service
// worker, purges the old cache, and fires an update prompt — without it, sw.js would be
// byte-identical each deploy and users would get stuck on stale builds.
const CACHE_VERSION = 'bm-__BUILD_VERSION__';
// The shell is cached under ONE key, not per navigation URL — otherwise every SPA route ever
// visited would leave its own byte-identical copy of index.html in the cache.
const SHELL_URL = '/index.html';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = ['/', SHELL_URL, OFFLINE_URL];

// Install: cache shell assets. NOTE: no skipWaiting() here — the new SW stays in the
// "waiting" state so open tabs are never force-reloaded mid-work. Activation happens either
// when the user chooses to update, or naturally on the next full launch after all tabs close.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // One at a time, NOT addAll: addAll is atomic, so a single 404 (a path that moved, a
      // deploy race) would fail the whole install and leave the app with no worker at all.
      Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)))
    )
  );
});

// Activate: clean old caches and take control immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'sw-updated' });
    });
  });
});

// Fetch: network-first for navigation, cache-first for static assets.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  // Never cache the SW's own script, the manifest, or the touch icons — they must always come
  // from the network so new deploys are detected and updates are reliable.
  if (request.url.endsWith('/sw.js') || request.url.endsWith('/manifest.json')) return;
  if (/\/icon-(192|512)\.png$/.test(request.url)) return;

  // Navigation: network-first, but race the network against a 3s timer — on flaky mobile
  // signal the cached shell wins instead of a hanging white screen. A late network response
  // still lands in the cache for next time.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const networkPromise = fetch(request).then((response) => {
        const clone = response.clone();
        event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(SHELL_URL, clone)));
        return response;
      });
      networkPromise.catch(() => undefined);
      const timeout = new Promise((resolve) => setTimeout(() => resolve(undefined), 3000));
      try {
        const winner = await Promise.race([networkPromise, timeout]);
        if (winner) return winner;
        const cached = await caches.match(SHELL_URL);
        return cached || (await networkPromise);
      } catch (_e) {
        const cached = await caches.match(SHELL_URL);
        if (cached) return cached;
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
        throw _e;
      }
    })());
    return;
  }

  // Static assets: cache-first. Vercel's SPA rewrite returns index.html with HTTP 200 for a
  // missing hashed chunk, so status === 404 alone is not a stale-build signal. Validate the
  // response MIME for JS/CSS and finish deleting the cached shell BEFORE returning the bad
  // response, so a chunk-error reload is guaranteed to fetch a fresh shell.
  if (request.url.match(/\.(js|css|woff2?|svg|png|jpg|webp)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then(async (response) => {
          const pathname = new URL(request.url).pathname;
          const contentType = response.headers.get('content-type') ?? '';
          const isJavaScript = /\.js$/.test(pathname);
          const isStylesheet = /\.css$/.test(pathname);
          const invalidCodeAsset = (isJavaScript || isStylesheet) && (
            !response.ok
            || (isJavaScript && !/\b(?:java|ecma)script\b/i.test(contentType))
            || (isStylesheet && !/^text\/css\b/i.test(contentType))
          );

          if (invalidCodeAsset) {
            const cache = await caches.open(CACHE_VERSION);
            await Promise.all([
              cache.delete('/'),
              cache.delete(SHELL_URL),
            ]);
            return response;
          }

          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)));
          return response;
        });
      })
    );
    return;
  }
});

// Listen for a skip-waiting message from the app (an "Update now" banner, once built).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
