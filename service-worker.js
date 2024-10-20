const CACHE_NAME = 'galeria-cache-v3'; // Aumenta el número de versión para asegurarte de que se reemplazará la caché anterior

// Archivos a cachear (solo solicitudes GET permitidas)
const urlsToCache = [
    'index.html',
    'formulario.html',
    'verGaleria.html',
    'verGaleria2.html',
    'verGaleria3.html',
    'offline.html',
    'service-worker.js',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap'
];

self.addEventListener('fetch', (event) => {
    // Ignorar solicitudes no-GET
    if (event.request.method !== 'GET') {
        return;
    }

    // No cachear archivos de Firebase Storage u otros servicios externos
    if (event.request.url.includes('firebasestorage.googleapis.com') || event.request.url.includes('googleapis.com')) {
        return fetch(event.request).catch((error) => {
            console.error('Error al obtener recurso de la red:', error);
            return caches.match('offline.html');
        });
    }

    // Estrategia "network-first" para el resto de recursos
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                } else {
                    return networkResponse;
                }
            })
            .catch((error) => {
                console.error('Error al obtener recurso de la red:', error);
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return caches.match('offline.html');
                });
            })
    );
});
