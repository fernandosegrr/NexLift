// Compiled only as a separate entry by the disposable phase 3.5 runner.
import { api, operationRuntime } from '../src/services/api.js';
import { createStorageRuntime, getStorageRuntime } from '../src/storage/runtime.js';
import { createOperationSync } from '../src/services/operationSync.js';
import { createOperationTransport } from '../src/services/operationTransport.js';
import { normalizePayload, payloadHash, canonicalJSON, sha256 } from '../src/services/operationProtocol.js';
import { mexicoCityDateStr } from '../src/utils/dates.js';
import { operationRow } from '../src/storage/operationRepository.js';
import { verifyLocalBackup, sealLocalBackup } from '../src/storage/localBackup.js';

const assert = (value, message = 'Invariant failed') => { if (!value) throw new Error(message); };
const equal = (a, b) => assert(canonicalJSON(a) === canonicalJSON(b), `Mismatch: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
const memoryStorage = () => {
    const map = new Map();
    return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)),
        key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
};
const sets = [{ weight: 86, reps: 8, rpe: 8, completed: true }];
const performedAt = '2026-10-18T05:59:59.999Z';
async function envelope(order = 1, extra = {}) {
    const payload = normalizePayload({ operationId: crypto.randomUUID(), source: 'pwa', kind: 'workout.create',
        performedAt, ...(extra.kind === 'rest.create' ? { note: `load-${order}` } : { exerciseId: 'B-Exercise', sets, notes: `load-${order}` }), ...extra });
    return { format: 1, id: payload.operationId, ownerId: 'B', payload, requestHash: await payloadHash(payload),
        originalDay: mexicoCityDateStr(performedAt), createdAt: Date.now(), localOrder: order, dependsOn: [], initialStatus: 'pending' };
}
const cases = [];
const test = (name, task) => cases.push({ name, task });
let config;
function isolated(options = {}) {
    const r = createStorageRuntime({ name: `nexlift-phase35-${crypto.randomUUID()}`, storage: memoryStorage(),
        identity: () => ({ ownerId: 'B', token: config.tokenB }), conflictsEnabled: true, ...options });
    return r;
}
function engine(r, options = {}) {
    let clock = Date.now(); const requests = [];
    const transport = createOperationTransport({ apiUrl: '/api', storage: memoryStorage(),
        identity: () => ({ ownerId: 'B', token: config.tokenB }), events: new EventTarget(),
        fetcher: async (...args) => { requests.push({ url: args[0], method: args[1].method }); return fetch(...args); }, ...options });
    const sync = createOperationSync({ store: r.store, transport, enabled: true, now: () => clock,
        setTimer: () => 0, clearTimer: () => {} });
    return { sync, transport, requests, advance: () => { clock += 301000; } };
}

test('antes de guardar IDB: cuota revierte operacion y metadata; formulario sigue recuperable', async () => {
    const r = isolated(); await r.ready(); const item = await envelope();
    const original = r.db.metadata.put.bind(r.db.metadata);
    r.db.metadata.put = () => { throw new DOMException('injected quota', 'QuotaExceededError'); };
    let error; try { await r.store.create(item); } catch (e) { error = e; }
    assert(error?.isStorageError); equal(await r.db.operations.count(), 0);
    equal(await r.db.metadata.get(`operation:B:${item.id}`), undefined);
    r.db.metadata.put = original; await r.store.create(item);
    equal((await r.store.get('B', item.id)).payload, item.payload); r.close();
});
test('despues de persistir y antes de fetch: reinicio conserva UUID hash y contenido', async () => {
    const r = isolated(); await r.ready(); const item = await envelope(); await r.store.create(item); const name = r.db.name; r.close();
    const reopened = isolated({ name }); await reopened.ready();
    const found = await reopened.store.get('B', item.id); equal(found.payload, item.payload); equal(found.requestHash, item.requestHash);
    const e = engine(reopened); await e.sync.run(); equal((await reopened.store.get('B', item.id)).status, 'confirmed');
    await e.sync.run(); equal(e.requests.filter(x => x.method === 'POST').length, 1); reopened.close();
});
test('acuse recibido pero Dexie falla: rollback atomico y recuperacion GET sin segundo POST', async () => {
    const r = isolated(); await r.ready(); const item = await envelope(); await r.store.create(item);
    const original = r.db.receipts.put.bind(r.db.receipts);
    r.db.receipts.put = () => { throw new DOMException('injected quota', 'QuotaExceededError'); };
    const e = engine(r); let error; try { await e.sync.run(); } catch (cause) { error = cause; }
    assert(error?.isStorageError); const failed = await r.store.get('B', item.id);
    equal(failed.status, 'syncing'); equal(await r.db.receipts.count(), 0); equal(failed.payload, item.payload);
    r.db.receipts.put = original; await e.sync.run(); const recovered = await r.store.get('B', item.id);
    equal(recovered.status, 'confirmed'); equal(await r.db.receipts.count(), 1);
    equal(e.requests.filter(x => x.method === 'POST').length, 1); r.close();
});
test('legacy interrumpido: v1 y borrador recuperan; ambiguo conserva fuente sin propietario', async () => {
    const storage = memoryStorage(), item = await envelope();
    const key = `nexlift_operation_v1:B:${item.id}:payload`, raw = JSON.stringify(item);
    storage.setItem(key, raw); storage.setItem('nexlift_offline_queue', '[{"weight":44,"timestamp":"yesterday"}]');
    storage.setItem('nexlift_draft_v2:old', JSON.stringify({ version: 2, ownerId: 'B', kind: 'session', resourceId: 'old-log',
        createdAt: 1, updatedAt: 2, originalDay: '2026-10-19', data: { sets: [{ weight: '123', reps: '7' }] } }));
    const a = isolated({ storage, checkpoint: async stage => { if (stage === 'batch') throw new Error('interrupt'); } });
    const name = a.db.name; let failed = false; try { await a.ready(); } catch { failed = true; } assert(failed); a.close();
    const b = isolated({ name, storage }); await b.ready(); equal((await b.store.list('B')).length, 1);
    equal((await b.drafts.list('B'))[0].data.sets[0].weight, '123'); equal(storage.getItem(key), raw);
    equal((await b.db.sources.where('key').equals('nexlift_offline_queue').first()).ownerId, null);
    equal((await b.db.metadata.get('migration')).finalCutover, false); b.close();
});
test('conserva instante anterior a medianoche y dia CDMX al enviar dias despues', async () => {
    const r = isolated(); await r.ready(); const item = await envelope(); await r.store.create(item);
    const e = engine(r); await e.sync.run(); const found = await r.store.get('B', item.id);
    equal(found.status, 'confirmed'); equal(found.receipt.operation.performedAt, performedAt);
    equal(found.receipt.operation.performedDay, '2026-10-17'); equal(found.receipt.result.workoutLog.date, performedAt);
    assert(Date.now() > Date.parse('2026-10-18T06:00:00.000Z'), 'Synchronization is after the following CDMX midnight');r.close();
});
test('JWT realmente caducado pausa; JWT revocado en PostgreSQL tampoco confirma ni borra', async () => {
    const r = isolated(); await r.ready(); const item = await envelope(); await r.store.create(item);
    for (const token of [config.expiredToken, config.revokedToken]) {
        const e = engine(r, { identity: () => ({ ownerId: 'B', token }) }); await e.sync.retry();
        equal((await r.store.get('B', item.id)).status, 'paused_auth'); equal(await r.db.receipts.count(), 0);
    }
    const good = engine(r); await good.sync.retry(); equal((await r.store.get('B', item.id)).status, 'confirmed'); r.close();
});
test('respuesta tardia A bajo B no escribe confirmacion y A la recupera por comprobante', async () => {
    let current = { ownerId: 'B', token: config.tokenB }, switched = false;
    const r = isolated({ identity: () => current }); await r.ready(); const item = await envelope(); await r.store.create(item);
    const transport = createOperationTransport({ apiUrl: '/api', storage: memoryStorage(), events: new EventTarget(), identity: () => current,
        fetcher: async (...args) => { const response = await fetch(...args); if (args[1].method === 'POST') { current = {ownerId:'A',token:config.tokenA}; switched = true; } return response; } });
    const sync = createOperationSync({ store:r.store,transport,enabled:true,setTimer:()=>0,clearTimer:()=>{} }); await sync.run();
    assert(switched); equal((await r.store.get('B',item.id)).status,'syncing'); equal((await r.store.list('A')).length,0);
    equal(await r.db.receipts.count(),0); current={ownerId:'B',token:config.tokenB}; await sync.run();
    equal((await r.store.get('B',item.id)).status,'confirmed'); r.close();
});
test('bloqueo FIFO explicado conserva operaciones independientes y dependientes', async () => {
    const r = isolated(); await r.ready(); const a = await envelope(1), b = await envelope(2), c = await envelope(3);
    c.dependsOn=[a.id]; c.initialStatus='blocked_dependency';
    await r.store.create(a); await r.store.create(b); await r.store.create(c);
    await r.store.record('B',a.id,{status:'blocked_validation',lastError:'Requiere revisar el original antes de continuar'});
    const e = engine(r); await e.sync.run(); equal(e.requests.length,0);
    const rows=await r.store.list('B'); equal(rows.map(row=>row.payload),[a.payload,b.payload,c.payload]);
    equal(rows[1].status,'pending'); equal(rows[2].status,'blocked_dependency'); r.close();
});
test('1000 registros mixtos: error inicial detiene FIFO sin bucle, borrado ni avance dependiente', async () => {
    const r=isolated();await r.ready();const items=await Promise.all(Array.from({length:1000},(_,i)=>envelope(i+1,
        i===0?{exerciseId:'synthetic-missing-exercise'}:i%10?{kind:'rest.create'}:{})));
    items[999].dependsOn=[items[0].id];items[999].initialStatus='blocked_dependency';
    await r.db.transaction('rw',r.db.operations,()=>r.db.operations.bulkAdd(items.map(operationRow)));
    const original=await sha256(canonicalJSON(items.map(x=>x.payload))),e=engine(r);await e.sync.run();
    const requests=e.requests.length;await e.sync.run();await e.sync.run();equal(e.requests.length,requests);
    const rows=await r.store.list('B');equal(rows.length,1000);equal(rows[0].status,'blocked_validation');
    equal(rows[999].status,'blocked_dependency');equal(rows.filter(x=>x.status==='pending').length,998);
    equal(await sha256(canonicalJSON(rows.map(x=>x.payload))),original);equal(await r.db.receipts.count(),0);r.close();
});

test('respaldo completo verifica estructura IDs hashes y rechaza archivo modificado', async () => {
    const r=isolated();await r.ready();const item=await envelope();await r.store.create(item);
    await r.drafts.editor('session','synthetic','B').save({sets:[{weight:'41',reps:'8'}]});
    await r.store.record('B',item.id,{status:'blocked_validation',lastError:'Review retained original'});
    const data=await r.export('B');const report=await verifyLocalBackup(data,'B');
    equal(report.valid,true);equal(report.importSupported,false);equal(report.counts.operations,1);equal(report.counts.drafts,1);
    const changed=structuredClone(data);changed.operations[0].envelope.payload.sets[0].weight=100;
    let failed=false;try{await verifyLocalBackup(changed,'B');}catch{failed=true;}assert(failed);
    failed=false;try{await verifyLocalBackup(data,'A');}catch{failed=true;}assert(failed);
    assert(!JSON.stringify(data).includes(config.tokenB));r.close();
});
test('respaldo historico sin checksum requiere revision explicita y no promete importacion', async () => {
    const r=isolated();await r.ready();const data=await r.export('B');delete data.integrity;
    let failed=false;try{await verifyLocalBackup(data,'B');}catch{failed=true;}assert(failed);
    equal((await verifyLocalBackup(data,'B',{allowUnverified:true})).integrity,'unverified-legacy');r.close();
});
test('no exporta confirmacion sin comprobante ni fuentes alteradas aun recalculando checksum', async () => {
    const r=isolated();await r.ready();const item=await envelope();await r.store.create(item);
    const data=await r.export('B');delete data.integrity;data.operations[0].status='confirmed';
    let failed=false;try{await sealLocalBackup(data);}catch{failed=true;}assert(failed);r.close();
});

async function load(size) {
    const start = performance.now(), r = isolated(); await r.ready(); const initialized = performance.now()-start;
    const items = await Promise.all(Array.from({length:size},(_,i)=>envelope(i+1,i%10 ? {kind:'rest.create'} : {})));
    // Valid immutable envelopes, bulk loaded into a real transaction to keep the
    // measurement focused on reading/sending rather than 5000 UI clicks.
    await r.db.transaction('rw',r.db.operations,()=>r.db.operations.bulkAdd(items.map(operationRow)));
    const queryStart=performance.now(), rows=await r.store.list('B'), queryMs=performance.now()-queryStart;
    equal(rows.length,size); const aggregate=await sha256(canonicalJSON(rows.map(x=>[x.id,x.requestHash])));
    const name=r.db.name; r.close(); const recoveryStart=performance.now(), reopened=isolated({name}); await reopened.ready();
    equal(await sha256(canonicalJSON((await reopened.store.list('B')).map(x=>[x.id,x.requestHash]))),aggregate);
    const recoveryMs=performance.now()-recoveryStart, e=engine(reopened); let ticks=0,maxDrift=0,last=performance.now();
    const timer=setInterval(()=>{const time=performance.now();maxDrift=Math.max(maxDrift,time-last-50);last=time;ticks++;},50);
    const syncStart=performance.now(); await e.sync.run(); const syncMs=performance.now()-syncStart; clearInterval(timer);
    const final=await reopened.store.list('B'); equal(final.filter(x=>x.status==='confirmed').length,size);
    equal(e.requests.filter(x=>x.method==='POST').length,size); const requestCount=e.requests.length;
    await e.sync.run(); equal(e.requests.length,requestCount);
    equal(new Set(final.map(x=>x.receipt.result.workoutLog?.id || x.receipt.result.restLog.id)).size,size);
    const bytes=JSON.stringify(await reopened.export('B')).length, estimate=await navigator.storage.estimate();
    reopened.close(); return {size,initializedMs:initialized,queryMs,recoveryMs,syncMs,ticks,maxDriftMs:maxDrift,
        workouts:Math.ceil(size/10),rests:size-Math.ceil(size/10),exportBytes:bytes,originUsage:estimate.usage,requests:requestCount,posts:size,redundantPosts:0,aggregate};
}
function input(selector,value) {
    const element=document.querySelector(selector); assert(element,`Missing input ${selector}`);
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(element,String(value));element.dispatchEvent(new Event('input',{bubbles:true}));
}
globalThis.phase35 = { api, operationRuntime, getStorageRuntime, createStorageRuntime, envelope, load, input,
    async visibleLoad(size, blocked=false) {
        const r=getStorageRuntime();await r.ready();
        const items=await Promise.all(Array.from({length:size},(_,i)=>envelope(i+1,i%10?{kind:'rest.create'}:{})));
        if(blocked)items[0].initialStatus='blocked_validation';
        await r.db.transaction('rw',r.db.operations,()=>r.db.operations.bulkAdd(items.map(operationRow)));
        await r.store.record('B',items[0].id,{status:blocked?'blocked_validation':'pending',lastError:blocked?'Cola de ensayo detenida para revision; originales conservados':null});
        return {ids:items.map(x=>x.id),hash:await sha256(canonicalJSON(items.map(x=>[x.id,x.requestHash])))};
    },
    async lostReply(settings) {
        config=settings;const r=isolated();await r.ready();const e=engine(r);
        await e.transport.remember({id:'B'},config.tokenB);
        const saved=await e.sync.capture('rest.create',{note:'Respuesta perdida 3.5'},{ownerId:'B'});
        const result={...saved,name:r.db.name};r.close();return result;
    },
    async recoverReply(saved,settings) {
        config=settings;const r=isolated({name:saved.name});await r.ready();const e=engine(r);e.advance();await e.sync.run();
        const result=await r.store.get('B',saved.operationId);r.close();return result;
    },
    caseNames:cases.map(c=>c.name), async runCase(i,settings) { config=settings; await cases[i].task(); return {passed:true}; },
    configure:settings=>{config=settings;},
    async state() { return operationRuntime().store.list('A'); }
};
