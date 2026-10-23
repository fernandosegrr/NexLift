// NexLift Service Worker — PWA offline + instalable
// Estrategia:
//  - Assets hasheados (/assets/*): cache-first (son inmutables, el hash cambia en cada build)
//  - Navegación (HTML): network-first con fallback al shell cacheado (offline)
//  - API: solo red; nunca usar datos cacheados como evidencia de persistencia
//  - Estáticos varios (iconos, manifest, logo): cache-first
// Bump en cada release de UI crítica para no servir shell viejo (header logo, etc.)
const VERSION = 'v4.0-phase9-private-cache';
const STATIC_CACHE = `nexlift-static-${VERSION}`;
const SHELL_URL = '/index.html';
function isApiPath(pathname) {
    try { return /^\/api(?:\/|$)/i.test(decodeURIComponent(pathname)); } catch { return true; }
}

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
                keys.filter((k) => k.startsWith('nexlift-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// El cliente puede pedir activación inmediata del SW nuevo
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data?.type === 'CACHE_PUBLIC_ASSETS' && Array.isArray(event.data.urls)) {
        // The first controlled page need not reload. Cache its already loaded
        // public JS/CSS/icons, but never accept API URLs, credentials or queries
        // from a message, nor cache redirects/HTML masquerading as an asset.
        const urls = [...new Set(event.data.urls.filter(value => typeof value === 'string'))].slice(0, 64);
        event.waitUntil(caches.open(STATIC_CACHE).then(cache => Promise.all(urls.map(async value => {
            try {
                const url = new URL(value, self.location.origin);
                const code = /^\/assets\/[\w.-]+\.(?:js|css)$/.test(url.pathname);
                const icon = ['/logo.png', '/icon-192.png', '/icon-512.png'].includes(url.pathname);
                if (url.origin !== self.location.origin || url.username || url.password || url.search || url.hash || (!code && !icon)) return;
                if (await cache.match(url.href)) return;
                const response = await fetch(url.href, { credentials: 'omit', cache: 'no-store' });
                const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
                const expected = icon ? type === 'image/png' : url.pathname.endsWith('.css') ? type === 'text/css' : ['text/javascript', 'application/javascript'].includes(type);
                if (response.ok && !response.redirected && expected) await cache.put(url.href, response);
            } catch { /* A failed public asset request is not an API response. */ }
        }))));
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    // Exclude private requests BEFORE navigation: a direct API navigation must
    // never replace index.html with JSON or use a previous account's shell.
    if ((sameOrigin && isApiPath(url.pathname)) || request.headers.has('Authorization')) {
        event.respondWith(fetch(request, { cache: 'no-store' }));
        return;
    }

    // Navegación (apertura/recarga de la app): network-first, fallback al shell
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    if (res.ok && !res.redirected && (res.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) {
                        const copy = res.clone();
                        caches.open(STATIC_CACHE).then((c) => c.put(SHELL_URL, copy));
                    }
                    return res;
                })
                .catch(() => caches.match(SHELL_URL).then((r) => r || caches.match('/')))
        );
        return;
    }

    // API responses may belong to another account or be stale. Old cache data
    // stays untouched but is never read for API requests, including auth/me.
    // Assets hasheados de Vite: cache-first (inmutables)
    if (sameOrigin && url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.match(request).then((cached) =>
                cached ||
                fetch(request).then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
                    }
                    return res;
                })
            )
        );
        return;
    }

    // Only explicit public files: unknown same-origin URLs may contain photos or
    // private responses authenticated by cookies. Never put those in CacheStorage.
    if (sameOrigin && !url.search && ['/logo.png', '/icon-192.png', '/icon-512.png', '/manifest.json', '/manifest.webmanifest', '/favicon.ico'].includes(url.pathname)) {
        event.respondWith(
            caches.match(request).then((cached) =>
                cached ||
                fetch(request).then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
                    }
                    return res;
                }).catch(() => cached)
            )
        );
    }
});

// Web Push (recordatorio de descanso y recordatorios escalonados de creatina).
// En iOS 16.4+ solo funciona con la PWA añadida a la pantalla de inicio.
function notificationTarget(value) {
    try {
        const target = new URL(typeof value === 'string' ? value : '/', self.location.origin);
        if (target.origin !== self.location.origin || target.username || target.password || isApiPath(target.pathname)) return '/';
        return target.pathname + target.search + target.hash;
    } catch { return '/'; }
}

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {};
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    const title = data.title || 'NexLift';
    // Si viene data.tag explícito (ej. 'creatine-reminder-2026-10-15'), se usa para no
    // colisionar con los avisos de descanso ('rest-<exerciseId>' o 'rest-generic').
    const tag = data.tag || (data.exerciseId ? `rest-${data.exerciseId}` : 'rest-generic');
    const targetUrl = notificationTarget(data.url);
    const eventId = typeof data.eventId === 'string' && data.eventId.length <= 128 ? data.eventId : null;

    event.waitUntil(
        (async () => {
        const previous = eventId && self.registration.getNotifications
            ? await self.registration.getNotifications({ tag }).catch(() => []) : [];
        // Stable logical ID suppresses a duplicate provider attempt. A genuinely
        // new rest/stage may alert while replacing the old notification's tag.
        const renotify = eventId ? previous.some(item => item.data?.eventId !== eventId) : true;
        await self.registration.showNotification(title, {
            body: data.body || '',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag,
            renotify,
            data: {
                eventId,
                exerciseId: data.exerciseId || null,
                type: data.type || 'rest',
                url: targetUrl
            }
        });
        })()
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = notificationTarget(event.notification.data?.url);

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (new URL(client.url).origin !== self.location.origin) continue;
                if ('focus' in client) {
                    if ('navigate' in client && targetUrl) {
                        return client.navigate(targetUrl).then((c) => (c ? c.focus() : client.focus())).catch(() => client.focus());
                    }
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
