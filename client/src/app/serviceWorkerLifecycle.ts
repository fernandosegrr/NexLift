// The first claim already controls the freshly loaded UI. Reloading it can
// destroy an in-flight bootstrap/lease. Only subsequent worker changes need
// the existing one-time reload for a new frontend version.
export function createControllerReloadGuard(initiallyControlled: boolean): (hasController: boolean) => boolean {
    let controlled = initiallyControlled;
    let refreshing = false;
    return (hasController: boolean): boolean => {
        if (!hasController) return false;
        if (!controlled) { controlled = true; return false; }
        if (refreshing) return false;
        refreshing = true;
        return true;
    };
}

export function loadedPublicAssets(names: readonly string[], origin: string): string[] {
    const urls = new Set<string>();
    for (const name of names) {
        try {
            const url = new URL(name, origin);
            if (url.origin !== origin || url.username || url.password || url.search || url.hash) continue;
            if (/^\/assets\/[\w.-]+\.(?:js|css)$/.test(url.pathname)
                || ['/logo.png', '/icon-192.png', '/icon-512.png'].includes(url.pathname)) urls.add(url.href);
        } catch { /* Performance entries may include non-HTTP resources. */ }
    }
    return [...urls].slice(0, 64);
}

export function warmInitialPublicAssets(worker: Pick<ServiceWorker, 'postMessage'>, origin: string): void {
    const claimedAt = performance.now();
    const send = (names: readonly string[]): void => {
        const urls = loadedPublicAssets(names, origin);
        if (urls.length) worker.postMessage({ type: 'CACHE_PUBLIC_ASSETS', urls });
    };
    send(['/logo.png', '/icon-192.png', '/icon-512.png', ...performance.getEntriesByType('resource').map(entry => entry.name)]);
    // A module/image request can start before claim and finish afterwards.
    // Future requests are already observed by the worker's fetch handler.
    if (typeof PerformanceObserver === 'undefined') return;
    const observer = new PerformanceObserver(list => {
        send(list.getEntries().filter(entry => entry.startTime <= claimedAt && 'responseEnd' in entry
            && typeof entry.responseEnd === 'number' && entry.responseEnd > claimedAt).map(entry => entry.name));
    });
    try { observer.observe({ type: 'resource', buffered: true }); }
    catch { observer.disconnect(); return; }
    window.addEventListener('pagehide', (): void => observer.disconnect(), { once: true });
}
