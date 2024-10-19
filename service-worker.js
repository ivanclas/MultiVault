const CACHE_NAME = 'galeria-cache-v1';

// Archivos a cachear
const urlsToCache = [
                   
    'index.html',         
    'formulario.html',    
    'verGaleria.html',    
    'verGaleria2.html',   
    'verGaleria3.html',   
    'nuevo.html',         
    'MisCarpetas.html',   
    'offline.html',       // Página de fallback
    'service-worker.js',  
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap'
];

// Instalación: Cachear los archivos
self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalando y cacheando archivos...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache).catch((error) => {
                console.error('Error al cachear archivos:', error);
            });
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

// Interceptar solicitudes y servir desde la caché
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                console.log('Service Worker: Usando recurso en caché:', event.request.url);
                return response;
            }
            console.log('Service Worker: Recurso no encontrado en caché, solicitando...', event.request.url);
            return fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            });
        }).catch(() => caches.match('/offline.html')) // Mostrar fallback si no hay conexión
    );
});
