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

// Instalación: Cachear los archivos permitidos
self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalando y cacheando archivos...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Archivos cacheados correctamente');
                return cache.addAll(urlsToCache);
            })
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
        ).then(() => self.clients.claim())
    );
});

// Interceptar solicitudes y servir con estrategia de actualización en segundo plano
self.addEventListener('fetch', (event) => {
    // Ignorar solicitudes no-GET
    if (event.request.method !== 'GET') {
        console.info('Service Worker: Ignorando solicitud no-GET:', event.request.method, event.request.url);
        return;
    }

    // No cachear archivos de Firebase Storage u otros servicios externos
    if (event.request.url.includes('firebasestorage.googleapis.com') || event.request.url.includes('googleapis.com')) {
        console.warn('Service Worker: No cacheando recursos externos:', event.request.url);
        return fetch(event.request);
    }

    // Estrategia "network-first": Intenta obtener el recurso de la red primero, si falla, usa la caché.
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Verificar que la respuesta es válida (status 200) antes de cachearla
                if (networkResponse && networkResponse.status === 200) {
                    return caches.open(CACHE_NAME).then((cache) => {
                        // Actualiza la caché en segundo plano
                        cache.put(event.request, networkResponse.clone());
                        console.log('Service Worker: Recurso actualizado en la caché:', event.request.url);
                        return networkResponse;
                    });
                } else {
                    console.warn('Service Worker: Respuesta no válida o con estado distinto a 200:', event.request.url);
                    return networkResponse;
                }
            })
            .catch((error) => {
                console.error('Service Worker: Error al obtener recurso de la red:', error);
                // Intentar servir desde la caché o mostrar la página offline
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        console.log('Service Worker: Usando recurso en caché:', event.request.url);
                        return cachedResponse;
                    }
                    console.warn('Service Worker: Recurso no encontrado en caché, mostrando página offline');
                    return caches.match('offline.html');
                });
            })
    );
});
