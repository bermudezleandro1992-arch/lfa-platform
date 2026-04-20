const CACHE_NAME = "lfa-app-v3";
const urlsToCache = [
  "/",
  "/dashboard",
  "/sala",
  "/admin",
  "/adminsupport"
];

// Instalar y forzar activación inmediata
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Limpiar cachés viejos (Esto arregla tu problema)
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log("Borrando caché antigua de LFA:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia: Buscar siempre en internet primero para ver si hay cambios, si no hay internet, usar caché.
self.addEventListener("fetch", event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  }
});