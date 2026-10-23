import { assertNoSecrets, clone } from './database.js';
import { canonicalJSON, sha256, verifyReceipt } from '../services/operationProtocol.js';
import { validateEnvelope } from './operationRepository.js';

const arrays = ['originals', 'operations', 'events', 'receipts', 'drafts', 'draftVersions', 'sources', 'conflicts', 'conflictHistory'];
const fail = () => { throw new Error('El respaldo local está incompleto, modificado o no corresponde a esta cuenta. Conserva el archivo original.'); };
// Integrity detects accidental modification. An unkeyed hash is not a signature
// and never authorizes importing data or claiming an operation is confirmed.
export async function verifyLocalBackup(data, ownerId, { allowUnverified = false } = {}) {
    assertNoSecrets(data);
    if (data?.format !== 'nexlift-local-backup' || data.version !== 1 || data.ownerId !== ownerId
        || typeof ownerId !== 'string' || !ownerId || !Number.isFinite(Date.parse(data.createdAt))
        || typeof data.available !== 'boolean' || !Array.isArray(data.originals)) fail();
    const { integrity, ...content } = data;
    if (integrity) {
        if (integrity.algorithm !== 'SHA-256' || integrity.scope !== 'canonical-content-v1'
            || await sha256(canonicalJSON(content)) !== integrity.hash) fail();
    } else if (!allowUnverified) fail();
    for (const key of arrays) {
        if ((data.available && !['conflicts', 'conflictHistory'].includes(key) && !Array.isArray(data[key]))
            || (data[key] !== undefined && !Array.isArray(data[key]))) fail();
    }
    const operations = new Map();
    for (const row of data.operations || []) {
        if (row.ownerId !== ownerId || operations.has(row.id) || row.envelope?.id !== row.id || row.envelope?.ownerId !== ownerId) fail();
        await validateEnvelope(row.envelope); operations.set(row.id, row);
    }
    const receipts = new Map();
    for (const row of data.receipts || []) {
        const operation = operations.get(row.operationId);
        if (row.ownerId !== ownerId || !operation || receipts.has(row.operationId)) fail();
        verifyReceipt(operation.envelope, row.receipt, row.receipt?.replayed ? 200 : 201); receipts.set(row.operationId, row);
    }
    for (const row of operations.values()) if (row.status === 'confirmed' && !receipts.has(row.id)) fail();
    for (const key of ['events', 'drafts', 'draftVersions', 'conflicts', 'conflictHistory']) {
        for (const row of data[key] || []) if (row.ownerId !== ownerId) fail();
    }
    for (const row of data.sources || []) {
        if (row.ownerId !== null && row.ownerId !== ownerId) fail();
        if (row.raw !== undefined && await sha256(row.raw) !== row.hash) fail();
    }
    return { valid: true, integrity: integrity ? 'verified' : 'unverified-legacy', ownerId,
        counts: Object.fromEntries(arrays.map(key => [key, data[key]?.length || 0])), importSupported: false };
}
export async function sealLocalBackup(data) {
    const content = clone(data);
    content.integrity = { algorithm: 'SHA-256', scope: 'canonical-content-v1', hash: await sha256(canonicalJSON(data)) };
    await verifyLocalBackup(content, content.ownerId); return content;
}
