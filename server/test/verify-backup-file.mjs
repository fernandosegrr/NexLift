// Invoked only by run-backup-integration.mjs; no source DB or .env is consulted.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createTestSchema } from './fixtures/backup-fixture.js';
import { validateBackup, ENTITY_NAMES, jsonCopy } from '../src/services/backupFormat.js';
import { exportBackup } from '../src/services/backupExport.js';
import { restoreBackup } from '../src/services/backupRestore.js';

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.NEXLIFT_BACKUP_TEST_PORT);
assert.equal(url.username, 'nexlift_backup_test');
assert.equal(url.pathname, '/nexlift_backup_test');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
try {
    const bytes = await readFile(process.argv[2]);
    const b = validateBackup(JSON.parse(bytes.toString('utf8')));
    if (b.compatibility?.incomplete) throw new Error('No se certifican archivos legacy como recuperación completa. Use su análisis de omisiones.');
    await createTestSchema(prisma);
    await prisma.user.create({ data: { ...b.data.User[0], passwordHash: '!NEXLIFT_CREDENTIALS_EXCLUDED!', isActive: false } });
    await restoreBackup(prisma, b, b.source.userId, { dryRun: false, restoreProfile: true });
    const actual = await exportBackup(prisma, b.source.userId);
    assert.deepEqual(actual.data, b.data, 'Every exported scalar value, ID and relationship must survive.');
    const second = await restoreBackup(prisma, b, b.source.userId, { dryRun: false, restoreProfile: true });
    assert.equal(second.plannedCreates, 0);
    assert.deepEqual((await exportBackup(prisma, b.source.userId)).data, actual.data);
    const receipt = { version: 1, verifiedAt: new Date().toISOString(), fileSha256: createHash('sha256').update(bytes).digest('hex'), backupChecksum: b.integrity.sha256,
        restoreVerified: true, fullScalarAndRelationshipComparison: true, secondExecutionCreated: 0, target: 'Disposable loopback-only PostgreSQL cluster',
        entities: Object.fromEntries(ENTITY_NAMES.map(n => [n, { original: b.data[n].length, restored: actual.data[n].length }])) };
    if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(jsonCopy(receipt), null, 2));
} finally { await prisma.$disconnect(); }
