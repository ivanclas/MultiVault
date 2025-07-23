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

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
