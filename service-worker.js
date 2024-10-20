const CACHE_NAME = 'galeria-cache-v2';

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

// Instalación: Cachear los archivos permitidos
self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalando y cacheando archivos...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
            .catch((error) => {
                console.error('Error al cachear archivos:', error);
            })
    );
});

// Activación: Eliminar cachés antiguas
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activado');
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Eliminando caché antigua:', cache);
                        return caches.delete(cache);
                    }
                })
            )
        ).then(() => self.clients.claim()) // Reclama control de las pestañas activas inmediatamente
    );
});

// Estrategia de Red Primero con Fallback a Caché
self.addEventListener('fetch', (event) => {
    // Ignorar solicitudes no-GET
    if (event.request.method !== 'GET') {
        console.warn('Service Worker: Ignorando solicitud no-GET:', event.request.method, event.request.url);
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Verificar que la respuesta es válida antes de cachearla
                if (!networkResponse || networkResponse.status !== 200) {
                    console.warn('Service Worker: Respuesta no válida:', event.request.url);
                    return networkResponse;
                }

                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone()); // Cachear la respuesta para futuras solicitudes
                    return networkResponse; // Devolver la respuesta de la red
                });
            })
            .catch(() => {
                // Si la red falla, buscar en la caché
                return caches.match(event.request).then((response) => {
                    if (response) {
                        console.log('Service Worker: Usando recurso en caché:', event.request.url);
                        return response;
                    }
                    // Si no se encuentra en la caché, mostrar la página offline
                    return caches.match('offline.html');
                });
            })
    );
});
