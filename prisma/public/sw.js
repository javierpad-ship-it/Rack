// Service worker mínimo: app shell offline-friendly. La app necesita red para
// consultar Supabase; el SW solo cachea el shell para arranque rápido/instalable.
const CACHE = 'prisma-v1';
const SHELL = ['/', '/login', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nunca cachear llamadas a Supabase ni navegaciones de datos.
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
});
