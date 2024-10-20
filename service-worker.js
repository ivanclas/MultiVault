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
        ).then(() => self.clients.claim())  // Forzar la activación inmediata del SW
    );
});

// Interceptar solicitudes y servir desde la caché
self.addEventListener('fetch', (event) => {
    // Ignorar solicitudes no-GET
    if (event.request.method !== 'GET') {
        console.info('Service Worker: Ignorando solicitud no-GET:', event.request.method, event.request.url);
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Verificar que la respuesta es válida (status 200) antes de cachearla
                if (networkResponse && networkResponse.status === 200) {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
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
