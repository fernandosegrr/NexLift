// Resume suspended documents without navigation or repeating mutations. Events
// coalesce and hidden/offline documents do no work; one visible retry per 30s
// also covers backend recovery without a browser `online` event.
export function startAvailabilityResume({ resume, events = globalThis.window, page = globalThis.document, network = globalThis.navigator }) {
    if (!events?.addEventListener || !page?.addEventListener) return () => {};
    let active = false, last = -Infinity, stopped = false;
    const wake = () => {
        if (stopped || active || page.visibilityState === 'hidden' || network.onLine === false || Date.now() - last < 5000) return;
        active = true; last = Date.now();
        void Promise.resolve().then(resume).catch(() => {}).finally(() => { active = false; });
    };
    for (const name of ['online', 'pageshow', 'focus']) events.addEventListener(name, wake);
    page.addEventListener('visibilitychange', wake);
    const timer = setInterval(wake, 30000);
    return () => {
        stopped = true; clearInterval(timer);
        for (const name of ['online', 'pageshow', 'focus']) events.removeEventListener(name, wake);
        page.removeEventListener('visibilitychange', wake);
    };
}
