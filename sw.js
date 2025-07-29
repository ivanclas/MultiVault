// Evento de instalación del Service Worker
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('my-cache').then((cache) => {
      return cache.addAll([
        '/MultiVault/',  
        '/MultiVault/index.html', 
        '/MultiVault/condiciones.html',
        '/MultiVault/formulario.html',
        '/MultiVault/login.html',
        '/MultiVault/menu.html',
        '/MultiVault/MisCarpetas.html',
        '/MultiVault/nuevo.html',
        '/MultiVault/privacidad.html',
        '/MultiVault/verGaleria.html',
        '/MultiVault/verGaleria2.html',
        '/MultiVault/verGaleria3.html',
        '/MultiVault/iconGaleria.png',
        '/MultiVault/manifest.json'  
      ]);
    })
  );
});

// Evento de activación del Service Worker
self.addEventListener('activate', (e) => {
  // Limpieza de caché antiguo (opcional)
  const cacheWhitelist = ['my-cache']; // Se mantiene solo el caché 'my-cache'
  
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            // Eliminar cachés antiguos
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Evento de solicitud de red (fetch)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Si la solicitud está en caché, la devuelve
      if (cachedResponse) {
        return cachedResponse;
      }

      // Si no está en caché, realiza una solicitud de red
      return fetch(e.request).then((networkResponse) => {
        // Si la respuesta de la red es válida, la agrega al caché
        if (networkResponse && networkResponse.status === 200) {
          caches.open('my-cache').then((cache) => {
            cache.put(e.request, networkResponse.clone()); // Almacena en caché
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.error("Error al hacer la solicitud:", err);
        return new Response("No se pudo recuperar la información, intenta de nuevo más tarde.", { status: 503 });
      });
    })
  );
});
