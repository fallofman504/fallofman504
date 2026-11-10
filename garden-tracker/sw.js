// Offline support: the app shell is cached so it opens even with no signal at the garden.
// Bump VERSION whenever the app files change so phones pick up the update.
const VERSION = 'gt-v4';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js?v=4', 'js/db.js', 'js/photos.js', 'js/report.js', 'js/util.js', 'js/version.js',
  'vendor/jspdf.umd.min.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's own cache so the newest files are stored
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first (so updates show up), falling back to the cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // always check GitHub for a newer copy when online (by URL: page loads can't take options)
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
