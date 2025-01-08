
// service-worker.js
const CACHE_NAME = 'music-app-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/images/icon-192x192.png',
  '/static/images/icon-512x512.png',

];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Handle songs downloaded for offline use
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/download_song/')) {
    event.respondWith(
      caches.open('songs-cache').then((cache) => {
        return cache.match(event.request).then((response) => {
          return response || fetch(event.request).then((response) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
  }
});