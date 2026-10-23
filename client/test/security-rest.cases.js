import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const { effects } = vi.hoisted(() => ({ effects: [] }));
vi.mock('react', async original => ({ ...(await original()), useState: value => [value, vi.fn()], useRef: value => ({ current: value }),
    useCallback: fn => fn, useEffect: fn => { effects.push(fn); } }));
import { useRestTimer } from '../src/features/workouts/useRestTimer';
beforeEach(() => {
    vi.useFakeTimers(); effects.length = 0;
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('explicit stop requests remote cancellation while expiry and PWA unmount preserve the scheduled push responsibility', async () => {
    const cancelled = vi.fn(), timer = useRestTimer(cancelled);
    const cleanups = effects.map(effect => effect());
    timer.start(1); await vi.advanceTimersByTimeAsync(1100); expect(cancelled).not.toHaveBeenCalled();
    timer.stop(); expect(cancelled).toHaveBeenCalledOnce();
    timer.start(90); cleanups.forEach(cleanup => cleanup?.()); await vi.advanceTimersByTimeAsync(100000);
    expect(cancelled).toHaveBeenCalledOnce();
});
