export async function storageEstimate(manager = globalThis.navigator?.storage) {
    const result = { estimateSupported: !!manager?.estimate, persistSupported: !!manager?.persist, persistedSupported: !!manager?.persisted };
    try {
        if (manager?.estimate) Object.assign(result, await manager.estimate());
        if (manager?.persisted) result.persisted = await manager.persisted();
    } catch { result.policyUnavailable = true; }
    return result;
}
export async function requestPersistence(manager = globalThis.navigator?.storage) {
    try { return manager?.persist ? await manager.persist() : false; } catch { return false; }
}
