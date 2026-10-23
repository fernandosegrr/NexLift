import { afterEach, expect, it, vi } from 'vitest';
import { startAvailabilityResume } from './availabilityResume.js';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('resume coalesces LTE/Wi-Fi, pageshow/focus; does no work suspended/offline; recovers without online event', async () => {
    vi.useFakeTimers();
    const events = new EventTarget(), page = new EventTarget(), network = { onLine: true };
    page.visibilityState = 'visible';
    const resume = vi.fn(async () => {}), stop = startAvailabilityResume({ resume, events, page, network });
    for (const name of ['online', 'pageshow', 'focus']) events.dispatchEvent(new Event(name));
    await vi.advanceTimersByTimeAsync(0); expect(resume).toHaveBeenCalledTimes(1);
    page.visibilityState = 'hidden'; await vi.advanceTimersByTimeAsync(30000); expect(resume).toHaveBeenCalledTimes(1);
    page.visibilityState = 'visible'; network.onLine = false;
    page.dispatchEvent(new Event('visibilitychange')); expect(resume).toHaveBeenCalledTimes(1);
    network.onLine = true; page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0); expect(resume).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30000); expect(resume).toHaveBeenCalledTimes(3);
    stop(); await vi.advanceTimersByTimeAsync(60000); events.dispatchEvent(new Event('focus'));
    expect(resume).toHaveBeenCalledTimes(3);
});
it('does not overlap a slow request; rejected recovery is bounded and can run again', async () => {
    vi.useFakeTimers(); const events = new EventTarget(), page = new EventTarget();
    let release; const resume = vi.fn(() => new Promise((_, reject) => { release = reject; }));
    const stop = startAvailabilityResume({ resume, events, page, network: { onLine: true } });
    events.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(60000);
    expect(resume).toHaveBeenCalledTimes(1); release(Error('503'));
    await vi.advanceTimersByTimeAsync(30000); expect(resume).toHaveBeenCalledTimes(2); stop(); release(Error('offline'));
});
it('a stalled authenticated read has a 15s deadline and preserves the saved session', async () => {
    const controller = new AbortController(), timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const store = new Map([['nexlift_token', 'token-A'], ['nexlift_user', '{"id":"A"}']]);
    vi.stubGlobal('localStorage', { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) });
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true }))));
    const { api } = await import('./api.js');
    const request = api.getProfile('token-A'), assertion = expect(request).rejects.toMatchObject({ isNetworkError: true });
    expect(timeout).toHaveBeenCalledWith(15000); controller.abort(); await assertion;
    expect(store.get('nexlift_token')).toBe('token-A'); expect(store.get('nexlift_user')).toBe('{"id":"A"}');
});
