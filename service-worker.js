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
            .then((cache) => {
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
        ).then(() => self.clients.claim()) // Tomar control de las pestañas abiertas
    );
});

// Interceptar solicitudes y servir desde la caché
self.addEventListener('fetch', (event) => {
    // Ignorar solicitudes no-GET
    if (event.request.method !== 'GET') {
        console.warn('Service Worker: Ignorando solicitud no-GET:', event.request.method, event.request.url);
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse.status === 200) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request).then((response) => {
                    if (response) {
                        console.log('Service Worker: Usando recurso en caché:', event.request.url);
                        return response;
                    }
                    console.warn('Service Worker: Mostrando página offline');
                    return caches.match('offline.html');
                });
            })
    );
});
