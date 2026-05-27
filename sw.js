// ============================================================
// sw.js — Service Worker PWA Censo de Mascotas
// Estrategia: 3 caches (inmutable / estático / dinámico)
// + Push Notifications en background (RF10, RNF04)
// ============================================================

const CACHE_INMUTABLE = 'censo-inmutable-v1';
const CACHE_STATIC    = 'censo-static-v1';
const CACHE_DYNAMIC   = 'censo-dynamic-v1';

function limpiarCache(cacheName, maxItems) {
    caches.open(cacheName).then(cache => {
        cache.keys().then(keys => {
            if (keys.length > maxItems) {
                cache.delete(keys[0]).then(() => limpiarCache(cacheName, maxItems));
            }
        });
    });
}


// ---- INSTALL ----
self.addEventListener('install', e => {

    const cacheStatic = caches.open(CACHE_STATIC).then(cache => {

        const assets = [
            '/',
            '/index.html',
            '/login.html',
            '/not-found.html',
            '/views/censo.html',
            '/views/mapa.html',
            '/views/mis-censos.html',
            '/js/db.js',
            '/js/sync.js',
            '/js/auth.js',
            '/js/photo.js',
            '/css/styles.css',
            '/manifest.json'
        ];

        return Promise.allSettled(
            assets.map(url =>
                cache.add(url).catch(err =>
                    console.warn('[SW] No se pudo cachear:', url)
                )
            )
        );
    });

    const cacheInmutable = caches.open(CACHE_INMUTABLE)
        .then(cache => cache.addAll([
            'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css',
            'https://cdn.jsdelivr.net/npm/pouchdb@9.0.0/dist/pouchdb.min.js',
            'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
            'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
            'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
        ]))
        .catch(err => console.warn('[SW] CDN cache parcial:', err));

    e.waitUntil(
        Promise.all([cacheStatic, cacheInmutable])
    );

    self.skipWaiting();
});

   


// ---- ACTIVATE ----
self.addEventListener('activate', e => {
    const permitidos = [CACHE_INMUTABLE, CACHE_STATIC, CACHE_DYNAMIC];
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => !permitidos.includes(k)).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ---- FETCH: Cache-first para assets, network-first para API ----
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    // API central → siempre red (datos en tiempo real)
    if (e.request.url.includes('/api/v1/') || e.request.url.includes('/notificaciones/')) {
        e.respondWith(
            fetch(e.request).catch(() => new Response(
                JSON.stringify({ error: 'Sin conexión' }),
                { headers: { 'Content-Type': 'application/json' } }
            ))
        );
        return;
    }

    // Assets → cache-first con fallback a red y cache dinámico
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                if (response && response.status === 200 && response.type !== 'opaque') {
                    caches.open(CACHE_DYNAMIC).then(cache => {
                    const responseToCache = response.clone();
                    cache.put(e.request, responseToCache);
                        limpiarCache(CACHE_DYNAMIC, 50);
                    });
                }
                return response;
            }).catch(() => {
                if (e.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('/not-found.html');
                }
            });
        })
    );
});

// ============================================================
// PUSH — recibir notificación del servidor (RF10)
// Funciona aunque la app esté cerrada (RNF04)
// ============================================================
self.addEventListener('push', e => {
    console.log('[SW] Push recibido');

    let payload = {};
    try {
        payload = e.data ? JSON.parse(e.data.text()) : {};
    } catch {
        payload = { titulo: '¡Nuevo Censo!', cuerpo: e.data ? e.data.text() : '' };
    }

    // Soportar formato del profe {titulo, cuerpo} Y formato estándar {notification:{title,body}}
    const notif  = payload.notification || {};
    const title  = payload.titulo  || notif.title || '🐾 ¡Nuevo Censo Registrado!';
    const body   = payload.cuerpo  || notif.body  || 'Se registró una nueva mascota en el sistema.';
    const icon   = payload.icon    || notif.icon  || '/manifest.json';
    const urlDst = (notif.data && notif.data.url) || payload.url || '/views/mapa.html';
    const idCenso = (notif.data && notif.data.idCenso) || payload.idCenso || '';

    const options = {
        body,
        icon,
        badge:   icon,
        vibrate: [100, 50, 100, 50, 100],
        tag:     'nuevo-censo-' + idCenso,        // evita duplicados con el mismo censo
        renotify: true,
        data:    { url: urlDst },
        actions: [
            { action: 'ver-mapa', title: '🗺️ Ver en el mapa' },
            { action: 'cerrar',   title: 'Cerrar' }
        ]
    };

    e.waitUntil(self.registration.showNotification(title, options));
});

// ---- Click en notificación → abrir mapa ----
self.addEventListener('notificationclick', e => {
    e.notification.close();
    if (e.action === 'cerrar') return;

    const urlDestino = e.notification.data?.url || '/views/mapa.html';

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Si la app ya está abierta, enfocarla
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(urlDestino);
                    return client.focus();
                }
            }
            // Si está cerrada, abrirla
            if (clients.openWindow) return clients.openWindow(urlDestino);
        })
    );
});