import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudBackupStore, userBackupPrefix } from '../src/services/backupService.js';
import { ENTITY_NAMES, USER_FIELDS, sealBackup } from '../src/services/backupFormat.js';
const makeBackup = () => {
    const data = Object.fromEntries(ENTITY_NAMES.map(n => [n, []]));
    data.User = [Object.fromEntries(USER_FIELDS.map(k => [k, ['createdAt', 'updatedAt'].includes(k) ? '2026-10-18T06:00:00.000Z' : k === 'creatineReminderEnabled' ? true : k === 'birthDate' ? null : k === 'id' ? 'A' : `safe-${k}`]))];
    return sealBackup(data);
};
const resource = (id, day, user = 'A') => ({ public_id: `${userBackupPrefix(user)}${id}.json`, created_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`, resource_type: 'raw', type: 'authenticated' });
function fixture(pages = [{ resources: [] }]) {
    const calls = { uploads: [], lists: [], destroys: [], urls: [], downloads: [] };
    let stored;
    const sdk = {
        uploader: {
            upload: async (uri, options) => { calls.uploads.push(options); stored = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8')); return { ...options }; },
            destroy: async (id, options) => { calls.destroys.push({ id, options }); return { result: 'ok' }; }
        },
        api: { resources: async options => { calls.lists.push(options); return pages[Number(options.next_cursor || 0)]; } },
        utils: { private_download_url: (...args) => { calls.urls.push(args); return 'https://synthetic.invalid/signed'; } }
    };
    const fetcher = async (...args) => { calls.downloads.push(args); return { ok: true, json: async () => stored }; };
    return { sdk, fetcher, calls, store: createCloudBackupStore(sdk, fetcher) };
}
test('upload raw authenticated sin username, con UUID y verificación de descarga', async () => {
    const f = fixture(); const b = makeBackup(); const result = await f.store.uploadBackup(b);
    assert.equal(result.storageVerified, true); assert.equal(result.restoreVerified, false);
    const o = f.calls.uploads[0]; assert.equal(o.type, 'authenticated'); assert.equal(o.resource_type, 'raw'); assert.equal(o.overwrite, false);
    assert.ok(o.public_id.startsWith(userBackupPrefix('A'))); assert.ok(!o.public_id.includes('safe-username'));
    assert.equal(f.calls.downloads.length, 1); assert.equal(f.calls.destroys.length, 0);
});
test('uploads simultáneos no colisionan aunque compartan generatedAt', async () => {
    const f = fixture(); const b = makeBackup(); await Promise.all([f.store.uploadBackup(b), f.store.uploadBackup(b)]);
    assert.notEqual(f.calls.uploads[0].public_id, f.calls.uploads[1].public_id);
});
test('checksum de descarga diferente no confirma respaldo exitoso', async () => {
    const f = fixture(); const b = makeBackup(); const other = makeBackup(); other.generatedAt = '2026-01-01T00:00:00.000Z';
    const { data, source, generatedAt } = other; const validOther = sealBackup(data, { generatedAt, identifier: source.identifier });
    const store = createCloudBackupStore(f.sdk, async () => ({ ok: true, json: async () => validOther }));
    await assert.rejects(store.uploadBackup(b), /no coincide/); assert.equal(f.calls.destroys.length, 0);
});
test('fallo en descarga no actualiza ni confirma éxito', async () => {
    const f = fixture(); const store = createCloudBackupStore(f.sdk, async () => ({ ok: false }));
    await assert.rejects(store.uploadBackup(makeBackup()), /verificar/);
});
test('respuesta de upload público es rechazada', async () => {
    const f = fixture(); f.sdk.uploader.upload = async () => ({ type: 'upload', resource_type: 'raw', public_id: 'public' });
    await assert.rejects(f.store.uploadBackup(makeBackup()), /privado/); assert.equal(f.calls.downloads.length, 0);
});
test('URL de descarga restringida al propietario y expira a los cinco minutos', () => {
    const f = fixture(); const before = Math.floor(Date.now() / 1000); const id = resource('x', 1).public_id;
    f.store.getBackupDownloadUrl(id, 'A');
    const [, format, options] = f.calls.urls[0]; assert.equal(format, 'json'); assert.equal(options.type, 'authenticated');
    assert.ok(options.expires_at >= before + 300 && options.expires_at <= before + 301);
    assert.throws(() => f.store.getBackupDownloadUrl(id, 'B'), /ámbito/);
});
test('no puede generarse una descarga global ni sin usuario', async () => {
    const f = fixture(); await assert.rejects(f.store.listBackups(), /usuario/);
    assert.throws(() => f.store.getBackupDownloadUrl('nexlift-backups/users/other/a.json', 'A'), /ámbito/);
});
test('legacy requiere selección administrativa explícita y no cambia el archivo', () => {
    const f = fixture(); const id = 'nexlift-backups/backup-old-2026-10-17';
    assert.throws(() => f.store.getBackupDownloadUrl(id, 'A'), /ámbito/);
    f.store.getBackupDownloadUrl(id, 'A', { allowLegacy: true }); assert.equal(f.calls.urls[0][1], 'json');
});
test('listado pagina hasta agotar y ordena por created_at real, no public_id', async () => {
    const f = fixture([{ resources: [resource('zz-older', 1)], next_cursor: '1' }, { resources: [resource('aa-newest', 18)] }]);
    const result = await f.store.listBackups('A'); assert.equal(result[0].public_id, resource('aa-newest', 18).public_id);
    assert.equal(f.calls.lists.length, 2); assert.equal(f.calls.lists[1].next_cursor, '1');
    assert.equal(f.calls.lists[0].prefix, userBackupPrefix('A'));
});
test('recursos de otras cuentas y legacy se excluyen aunque el proveedor los mezcle', async () => {
    const f = fixture([{ resources: [resource('own', 1), resource('other', 18, 'B'), { public_id: 'nexlift-backups/backup-old', created_at: '2026-10-18' }] }]);
    assert.equal((await f.store.listBackups('A')).length, 1);
});
test('retención real simulada conserva 14 por usuario y no elimina B ni legacy', async () => {
    const own = Array.from({ length: 18 }, (_, i) => resource(String(99 - i), i + 1));
    const f = fixture([{ resources: [...own, resource('B', 18, 'B'), { public_id: 'nexlift-backups/backup-legacy', created_at: '2026-01-01' }] }]);
    const r = await f.store.pruneOldBackups('A', { dryRun: false });
    assert.equal(r.kept, 14); assert.equal(r.deleted, 4);
    assert.deepEqual(f.calls.destroys.map(c => c.id).sort(), own.slice(0, 4).map(r => r.public_id).sort());
    assert.ok(f.calls.destroys.every(c => c.id.startsWith(userBackupPrefix('A')) && c.options.type === 'authenticated'));
});
test('retención por defecto es análisis, sin eliminaciones reales', async () => {
    const f = fixture([{ resources: Array.from({ length: 20 }, (_, i) => resource(String(i), i + 1)) }]);
    const r = await f.store.pruneOldBackups('A'); assert.equal(r.deleted, 0); assert.equal(r.candidates.length, 6); assert.equal(f.calls.destroys.length, 0);
});
test('listado fallido impide iniciar cualquier poda', async () => {
    const f = fixture(); f.sdk.api.resources = async () => { throw new Error('synthetic unavailable'); };
    await assert.rejects(f.store.pruneOldBackups('A', { dryRun: false }), /unavailable/); assert.equal(f.calls.destroys.length, 0);
});
test('cursor repetido y fecha inválida bloquean poda', async () => {
    const f = fixture([{ resources: [], next_cursor: '1' }, { resources: [], next_cursor: '1' }]);
    await assert.rejects(f.store.listBackups('A'), /Paginación/);
    const bad = fixture([{ resources: [{ ...resource('a', 1), created_at: 'invalid' }] }]);
    await assert.rejects(bad.store.pruneOldBackups('A', { dryRun: false }), /fecha/); assert.equal(bad.calls.destroys.length, 0);
});
test('poda fallida no inventa conteos de eliminaciones', async () => {
    const f = fixture([{ resources: Array.from({ length: 16 }, (_, i) => resource(String(i), i + 1)) }]);
    f.sdk.uploader.destroy = async () => ({ result: 'error' });
    await assert.rejects(f.store.pruneOldBackups('A', { dryRun: false }), e => e.details.deleted === 0);
});
test('recurso repetido entre páginas no provoca borrado duplicado', async () => {
    const r = resource('same', 1); const f = fixture([{ resources: [r], next_cursor: '1' }, { resources: [r] }]);
    assert.equal((await f.store.listBackups('A')).length, 1);
});
test('recurso ya ausente no se cuenta como eliminado por esta ejecución', async () => {
    const f = fixture([{ resources: Array.from({ length: 15 }, (_, i) => resource(String(i), i + 1)) }]);
    f.sdk.uploader.destroy = async () => ({ result: 'not found' });
    const r = await f.store.pruneOldBackups('A', { dryRun: false });
    assert.equal(r.deleted, 0); assert.equal(r.alreadyAbsent, 1); assert.equal(r.kept, 14);
});
