/* Arnav Game Studio Empire service worker: network-first pages, cache-first hashed assets. */
// v2: v1 could hold HTML stored under a missing chunk's URL (the host answers unknown paths with the app page) —
// renaming the cache clears it on activate.
const CACHE = 'ase-v2';
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];
/** Old builds' chunks pile up across deploys: keep the newest few hundred. */
const MAX_ASSETS = 300;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** A real file, not the app page the host serves for paths it doesn't have. */
const isAsset = (res) => res.ok && !(res.headers.get('content-type') || '').includes('text/html');

async function trim(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'));
  // oldest first (insertion order)
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Firebase / fonts / APIs
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // a chunk from an older build that's gone: say so (404) rather than hand the page over as a script
            if (res.ok && !isAsset(res)) return new Response('Not found', { status: 404, statusText: 'Not Found' });
            if (isAsset(res)) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy).then(() => trim(c)));
            }
            return res;
          }),
      ),
    );
    return;
  }
  // the icon and manifest: fresh when online, from the cache when not
  if (SHELL.includes(url.pathname)) {
    e.respondWith(fetch(req).catch(() => caches.match(url.pathname).then((hit) => hit || Response.error())));
  }
});
