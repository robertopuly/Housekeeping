const CACHE_NAME = 'hk-cache-v76';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css?v=76',
  '/js/audio.js?v=76',
  '/js/socket.js?v=76',
  '/js/chat.js?v=76',
  '/js/orders.js?v=76',
  '/js/deadlines.js?v=76',
  '/js/shopping.js?v=76',
  '/js/expenses.js?v=76',
  '/js/leave.js?v=76',
  '/js/presence.js?v=76',
  '/js/gallery.js?v=76',
  '/js/app.js?v=76',
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