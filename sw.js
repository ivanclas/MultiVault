// sw.js
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('my-cache').then((cache) => {
      return cache.addAll([
        '/',
        'index.html',
         'condiciones.html',
         'formulario.html',
         'login.html',
         'menu.html',
         'MisCarpetas.html',
         'nuevo.html',
         'privacidad.html',
         'verGaleria.html',
         'verGaleria2.html',
         'verGaleria3.html',
        'iconGaleria.png',
        'manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
