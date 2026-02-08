self.addEventListener('install', (event) => {
  console.log('Service Worker instalado');
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Responder con la red por defecto
  event.respondWith(fetch(event.request));
});