const CACHE_NAME = 'hk-cache-v51';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css?v=51',
  '/js/audio.js?v=51',
  '/js/socket.js?v=51',
  '/js/chat.js?v=51',
  '/js/orders.js?v=51',
  '/js/deadlines.js?v=51',
  '/js/shopping.js?v=51',
  '/js/expenses.js?v=51',
  '/js/leave.js?v=51',
  '/js/app.js?v=51',
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