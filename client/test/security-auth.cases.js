import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const { effects } = vi.hoisted(() => ({ effects: [] }));
vi.mock('react', async original => ({ ...(await original()), useState: value => [value, vi.fn()], useRef: value => ({ current: value }),
    useEffect: fn => { effects.push(fn); } }));
vi.mock('../src/services/api', () => ({ api: { login: vi.fn(), getProfile: vi.fn() }, replayOfflineQueue: vi.fn() }));
vi.mock('../src/utils/push', () => ({ unsubscribeFromPush: vi.fn(async () => {}) }));
import { api } from '../src/services/api';
import { AuthProvider } from '../src/context/AuthContext';
let storage;
beforeEach(async () => {
    effects.length = 0; vi.clearAllMocks(); storage = new Map([['nexlift_token', 'old-A'], ['nexlift_user', '{"id":"A"}']]);
    vi.stubGlobal('localStorage', { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) });
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('React', await import('react'));
});
afterEach(() => vi.unstubAllGlobals());
it('a login response from before another tab changes identity cannot replace that tab session or drafts', async () => {
    let finish; api.login.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const provider = AuthProvider({ children: null }); effects[1]();
    const pending = provider.props.value.login('a', 'Synthetic123');
    storage.set('nexlift_token', 'B'); storage.set('nexlift_user', '{"id":"B"}'); storage.set('draft-A', 'preserved');
    window.addEventListener.mock.calls.find(([name]) => name === 'storage')[1]({ key: 'nexlift_token' });
    finish({ user: { id: 'A' }, token: 'replacement-A' });
    await expect(pending).rejects.toThrow('sesión cambió');
    expect(storage.get('nexlift_token')).toBe('B'); expect(storage.get('nexlift_user')).toBe('{"id":"B"}');
    expect(storage.get('draft-A')).toBe('preserved'); expect(api.getProfile).not.toHaveBeenCalled();
});
