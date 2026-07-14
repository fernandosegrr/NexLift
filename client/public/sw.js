// NexLift Service Worker — PWA offline + instalable
// Estrategia:
//  - Assets hasheados (/assets/*): cache-first (son inmutables, el hash cambia en cada build)
//  - Navegación (HTML): network-first con fallback al shell cacheado (offline)
//  - API GET: network-first con fallback a la última respuesta cacheada
//  - Estáticos varios (iconos, manifest, logo): cache-first
const VERSION = 'v2.7.3';
const STATIC_CACHE = `nexlift-static-${VERSION}`;
const API_CACHE = `nexlift-api-${VERSION}`;
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => cache.addAll(['/', SHELL_URL]).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== STATIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    // Navegación (apertura/recarga de la app): network-first, fallback al shell
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(STATIC_CACHE).then((c) => c.put(SHELL_URL, copy));
                    return res;
                })
                .catch(() => caches.match(SHELL_URL).then((r) => r || caches.match('/')))
        );
        return;
    }

    // API: network-first con respaldo cacheado (datos visibles aunque estés offline)
    if (sameOrigin && url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(API_CACHE).then((c) => c.put(request, copy));
                    return res;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Assets hasheados de Vite: cache-first (inmutables)
    if (sameOrigin && url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.match(request).then((cached) =>
                cached ||
                fetch(request).then((res) => {
                    const copy = res.clone();
                    caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
                    return res;
                })
            )
        );
        return;
    }

    // Otros estáticos same-origin (iconos, manifest, logo): cache-first
    if (sameOrigin) {
        event.respondWith(
            caches.match(request).then((cached) =>
                cached ||
                fetch(request).then((res) => {
                    const copy = res.clone();
                    caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
                    return res;
                }).catch(() => cached)
            )
        );
    }
});

// Web Push (recordatorio de descanso, Tarea 2). En iOS 16.4+ solo funciona con la
// PWA añadida a la pantalla de inicio (no en una pestaña de Safari).
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = {};
    }
    const title = data.title || 'NexLift';
    // tag: una notificación nueva del mismo ejercicio reemplaza a la anterior en
    // vez de apilarse (antes, series seguidas del mismo ejercicio dejaban avisos
    // viejos acumulados). renotify: sin esto, reemplazar una notificación con el
    // mismo tag es silencioso (no vibra/suena) — y sí queremos que vuelva a
    // avisar, es un aviso de "se acabó tu descanso".
    event.waitUntil(
        self.registration.showNotification(title, {
            body: data.body || '',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: data.exerciseId ? `rest-${data.exerciseId}` : 'rest-generic',
            renotify: true,
            data: { exerciseId: data.exerciseId || null }
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});
