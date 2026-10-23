import { storageError } from './database.js';

// An IDB read/write transaction elects one lease holder. The monotonically
// increasing fence is checked in the SAME transaction as each state write.
export function createCoordination({ db, locks = globalThis.navigator?.locks, now = Date.now,
    uuid = () => crypto.randomUUID(), leaseMs = 60000, scheduleRenewal = setInterval, cancelRenewal = clearInterval }) {
    const active = new Map();
    async function checkFence(fence) {
        const lease = await db.leases.get(fence.key);
        if (!lease || lease.holder !== fence.holder || lease.generation !== fence.generation || lease.until <= now()) {
            throw Object.assign(storageError(new Error('Leadership lost')), { code: 'LEADERSHIP_LOST' });
        }
    }
    async function assertFence(ownerId) {
        const fence = active.get(ownerId);
        if (fence) await checkFence(fence); // capture/migration outside leadership
    }
    async function lead(ownerId, task) {
        if (active.has(ownerId)) return;
        const key = `sync:${ownerId}`, holder = uuid();
        const fence = await db.transaction('rw', db.leases, async () => {
            const old = await db.leases.get(key);
            if (old?.until > now()) return null;
            const next = { key, holder, generation: (old?.generation || 0) + 1, until: now() + leaseMs };
            await db.leases.put(next); return next;
        });
        if (!fence) return;
        active.set(ownerId, fence);
        const renewal = scheduleRenewal(() =>
            db.transaction('rw', db.leases, async () => {
                // Capture the fence, not the active map: a queued renewal can
                // run after finally removed that map entry and after takeover.
                await checkFence(fence);
                await db.leases.put({ ...fence, until: now() + leaseMs });
            }).catch(() => { /* expired holders cannot write state; originals remain */ }), Math.max(10, leaseMs / 3));
        try { return await task(); }
        finally {
            cancelRenewal(renewal); active.delete(ownerId);
            await db.transaction('rw', db.leases, async () => {
                const current = await db.leases.get(key);
                if (current?.holder === holder && current.generation === fence.generation) await db.leases.put({ ...current, until: 0 });
            });
        }
    }
    return { assertFence,
        withLock(ownerId, task) {
            const name = `nexlift-operation-sync:${ownerId}`; // shares name with 3.2
            return locks?.request ? locks.request(name, { ifAvailable: true }, lock => lock ? lead(ownerId, task) : undefined) : lead(ownerId, task);
        }
    };
}
