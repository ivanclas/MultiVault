const CACHE_NAME = 'galeria-cache-v1';

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
        )
    );
});

// Interceptar solicitudes y servir desde la caché, pero actualizar en segundo plano
self.addEventListener('fetch', (event) => {
    // Ignorar solicitudes no-GET
    if (event.request.method !== 'GET') {
        console.warn('Service Worker: Ignorando solicitud no-GET:', event.request.method, event.request.url);
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Si encontramos el recurso en la caché, lo devolvemos
            if (cachedResponse) {
                // Intentamos actualizar en segundo plano
                fetch(event.request).then((networkResponse) => {
                    // Solo actualizamos la caché si obtenemos una respuesta válida de la red
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                            console.log('Service Worker: Caché actualizada para', event.request.url);
                        });
                    }
                }).catch((error) => {
                    console.error('Service Worker: Error al actualizar recurso en segundo plano:', error);
                });

                // Retornar la versión cacheada
                return cachedResponse;
            }

            // Si no está en la caché, lo obtenemos de la red y lo cacheamos
            console.log('Service Worker: Recurso no encontrado en caché, solicitando...', event.request.url);
            return fetch(event.request)
                .then((networkResponse) => {
                    // Verificar que la respuesta es válida antes de cachearla
                    if (!networkResponse || networkResponse.status !== 200) {
                        console.warn('Service Worker: Respuesta no válida:', event.request.url);
                        return networkResponse;
                    }

                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                })
                .catch((error) => {
                    console.error('Service Worker: Error al obtener recurso:', error);
                    // Mostrar página de fallback en caso de error o sin conexión
                    return caches.match('offline.html');
                });
        })
    );
});
