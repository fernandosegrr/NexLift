import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Buffer } from 'node:buffer';
vi.mock('../src/services/api', () => ({ api: { getVapidPublicKey: vi.fn(), subscribeToPush: vi.fn(), unsubscribeFromPush: vi.fn() } }));
import { api } from '../src/services/api';
import { subscribeToPush, unsubscribeFromPush } from '../src/utils/push';

let subscription, permission, register;
beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map([['nexlift_token', 'A']]);
    vi.stubGlobal('localStorage', { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) });
    subscription = { endpoint: 'https://synthetic.invalid/device', unsubscribe: vi.fn(async () => true), toJSON: () => ({ endpoint: 'https://synthetic.invalid/device' }) };
    permission = vi.fn(async () => 'granted');
    register = { pushManager: { subscribe: vi.fn(async () => subscription), getSubscription: vi.fn(async () => subscription) } };
    vi.stubGlobal('window', { PushManager: {}, Notification: {}, atob: value => Buffer.from(value, 'base64').toString('binary') });
    vi.stubGlobal('Notification', { requestPermission: permission });
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(register) } });
    api.getVapidPublicKey.mockResolvedValue({ publicKey: 'BAEBAQ' });
    api.subscribeToPush.mockResolvedValue({ message: 'Subscribed' }); api.unsubscribeFromPush.mockResolvedValue({ message: 'Unsubscribed' });
});
afterEach(() => vi.unstubAllGlobals());
it('does not request browser permission merely by importing push utilities', () => { expect(permission).not.toHaveBeenCalled(); });
it('denied browser permission cannot create or register a push subscription', async () => {
    permission.mockResolvedValue('denied'); await expect(subscribeToPush()).rejects.toThrow('denegado');
    expect(register.pushManager.subscribe).not.toHaveBeenCalled(); expect(api.subscribeToPush).not.toHaveBeenCalled();
});
it('unsupported browser never prompts or contacts the backend', async () => {
    vi.stubGlobal('window', {}); await expect(subscribeToPush()).rejects.toThrow('soporta');
    expect(permission).not.toHaveBeenCalled(); expect(api.getVapidPublicKey).not.toHaveBeenCalled();
});
it('account switch during permission prompt cannot register the old device with the new account', async () => {
    permission.mockImplementation(async () => { localStorage.setItem('nexlift_token', 'B'); return 'granted'; });
    await expect(subscribeToPush()).rejects.toThrow('sesión cambió'); expect(api.subscribeToPush).not.toHaveBeenCalled();
});
it('logout uses captured departing credential after local session removal', async () => {
    const pending = unsubscribeFromPush('A'); localStorage.removeItem('nexlift_token'); await pending;
    expect(subscription.unsubscribe).toHaveBeenCalledOnce(); expect(api.unsubscribeFromPush).toHaveBeenCalledWith(subscription.endpoint, 'A');
});
it('late logout cleanup cannot remove a newly signed-in account device', async () => {
    const pending = unsubscribeFromPush('A'); localStorage.setItem('nexlift_token', 'B'); await pending;
    expect(subscription.unsubscribe).not.toHaveBeenCalled(); expect(api.unsubscribeFromPush).not.toHaveBeenCalled();
});
it('account switch during subscription persistence removes the old registration using only the old credential', async () => {
    api.subscribeToPush.mockImplementation(async () => { localStorage.setItem('nexlift_token', 'B'); return {}; });
    await expect(subscribeToPush()).rejects.toThrow('sesión cambió');
    expect(api.subscribeToPush).toHaveBeenCalledWith(subscription.toJSON(), 'A');
    expect(api.unsubscribeFromPush).toHaveBeenCalledWith(subscription.endpoint, 'A'); expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    vi.clearAllMocks(); localStorage.setItem('nexlift_token', 'A');
    api.subscribeToPush.mockImplementation(async () => { localStorage.setItem('nexlift_token', 'B'); throw Object.assign(Error('La sesión cambió'), { code: 'SESSION_CHANGED' }); });
    await expect(subscribeToPush()).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(api.unsubscribeFromPush).toHaveBeenCalledWith(subscription.endpoint, 'A'); expect(subscription.unsubscribe).toHaveBeenCalledOnce();
});
