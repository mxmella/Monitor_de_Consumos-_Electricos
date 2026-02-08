const CACHE_NAME = 'monitor-electrico-v2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './logo.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  // Realizar la instalación: guardar archivos en caché
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Archivos en caché guardados');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Responder con caché si existe, si no, ir a la red
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});