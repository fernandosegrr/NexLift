// NexLift Service Worker — PWA offline + instalable
// Estrategia:
//  - Assets hasheados (/assets/*): cache-first (son inmutables, el hash cambia en cada build)
//  - Navegación (HTML): network-first con fallback al shell cacheado (offline)
//  - API: solo red; nunca usar datos cacheados como evidencia de persistencia
//  - Estáticos varios (iconos, manifest, logo): cache-first
// Bump en cada release de UI crítica para no servir shell viejo (header logo, etc.)
const VERSION = 'v4.0-availability-1';
const STATIC_CACHE = `nexlift-static-${VERSION}`;
const SHELL_URL = '/index.html';
function isApiPath(pathname) {
    try { return /^\/api(?:\/|$)/i.test(decodeURIComponent(pathname)); } catch { return true; }
}

async function isShell(response) {
    if (!response || response.status !== 200 || response.redirected
        || !(response.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) return false;
    const html = await response.clone().text();
    return html.includes('<meta name="nexlift-shell" content="v4"') && html.includes('<div id="root"');
}
async function cachedShell() {
    // Use only our public shell caches. Never inspect private/IndexedDB data.
    const keys = await caches.keys();
    for (const key of [STATIC_CACHE, ...keys.filter(k => k.startsWith('nexlift-static-') && k !== STATIC_CACHE).reverse()]) {
        const response = await (await caches.open(key)).match(SHELL_URL);
        if (await isShell(response)) return response;
    }
}
const fetchDocument = request => fetch(request, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        // A failed update cannot replace a working worker with an empty cache.
        const response = await fetchDocument(SHELL_URL);
        if (!await isShell(response)) throw new Error('Public shell unavailable');
        await (await caches.open(STATIC_CACHE)).put(SHELL_URL, response);
        // No skipWaiting: the deployed v4 document reloads on controllerchange.
        // Wait for old documents to close naturally, including active workouts.
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        // Old documents can still import old hashed chunks during a workout.
        // Retain public assets across this rollout; no private stores are cleared.
        self.clients.claim()
    );
});

// Legacy documents send SKIP_WAITING automatically. Ignore it: those same
// documents reload on controllerchange and may contain an active workout.
self.addEventListener('message', (event) => {
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
    if (sameOrigin && request.mode === 'navigate') {
        const work = (async () => {
            let response;
            try { response = await fetchDocument(request); } catch { /* bounded offline fallback */ }
            if (await isShell(response)) {
                // A cache/storage failure must not hide a healthy network page.
                try { await (await caches.open(STATIC_CACHE)).put(SHELL_URL, response.clone()); } catch { /* quota/private mode */ }
                return response;
            }
            // Never substitute shell for auth failures/404s. Proxy 200 HTML is
            // untrusted too: it must not poison our app-shell cache.
            if (!response || response.status >= 500 || response.status === 408 || response.status === 200) {
                try { const shell = await cachedShell(); if (shell) return shell; } catch { /* storage unavailable */ }
            }
            return response || new Response('NexLift no está disponible. Vuelve a intentarlo al recuperar conexión.', {
                status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' }
            });
        })();
        event.respondWith(work);
        event.waitUntil(work.then(() => {}, () => {}));
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
                    // A rest notification must not replace an active workout
                    // with a navigation that may receive a proxy error page.
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
