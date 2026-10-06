const CACHE_NAME = 'hk-cache-v78';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css?v=78',
  '/js/audio.js?v=78',
  '/js/socket.js?v=78',
  '/js/chat.js?v=78',
  '/js/orders.js?v=78',
  '/js/deadlines.js?v=78',
  '/js/shopping.js?v=78',
  '/js/expenses.js?v=78',
  '/js/leave.js?v=78',
  '/js/presence.js?v=78',
  '/js/gallery.js?v=78',
  '/js/app.js?v=78',
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