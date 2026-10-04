const CACHE_NAME = 'hk-cache-v75';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css?v=75',
  '/js/audio.js?v=75',
  '/js/socket.js?v=75',
  '/js/chat.js?v=75',
  '/js/orders.js?v=75',
  '/js/deadlines.js?v=75',
  '/js/shopping.js?v=75',
  '/js/expenses.js?v=75',
  '/js/leave.js?v=75',
  '/js/presence.js?v=75',
  '/js/gallery.js?v=75',
  '/js/app.js?v=75',
  '/audio/happy-song.wav',
  '/audio/silence.wav',
  '/icons/icon.svg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/') || e.request.url.includes('/socket.io/') || e.request.url.includes('/uploads/')) {
    return;
  }
  // Network-first: toujours récupérer la version à jour depuis le serveur
  e.respondWith(
    fetch(e.request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && e.request.method === 'GET') {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return networkRes;
      })
      .catch(() => caches.match(e.request))
  );
});