// Offline support: cache the whole app on first visit, then serve from cache.
// Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'almanac-v1';
const FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/engine.js',
  'js/app.js',
  'data/plants.js',
  'data/zipdata.js',
  'vendor/html2canvas.min.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request))
  );
});
