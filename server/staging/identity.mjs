import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { databaseURL } from './environment.mjs';

export async function loadState(root) {
    const actual = await realpath(root);
    const state = JSON.parse(await readFile(path.join(actual, 'state.private.json'), 'utf8'));
    if (state.version !== 1 || !/^[a-f0-9]{32}$/.test(state.id) || state.root !== actual
        || !Number.isInteger(state.pgPort) || state.pgPort < 1024 || state.pgPort > 65535
        || !Number.isInteger(state.httpPort) || state.httpPort < 1024 || state.httpPort > 65535
        || state.data !== path.join(actual, 'postgres-data') || !/^\d+$/.test(state.systemId || '')) {
        throw new Error('Unrecognized staging identity; no operation permitted');
    }
    for (const [key, target] of Object.entries(state.databases)) {
        if (!/^[a-z][a-z0-9_]*$/.test(key) || !target.name.startsWith(`nexlift_stage_${state.id.slice(0, 8)}_`)
            || !/^[a-z0-9_]+$/.test(target.name) || !['reference', 'runtime', 'disposable', 'control'].includes(target.purpose)) {
            throw new Error('Unregistered staging database');
        }
    }
    return state;
}
export function client(state, name, role = 'admin') {
    return new PrismaClient({ datasources: { db: { url: databaseURL(state, name, role) } } });
}
export async function assertCluster(state) {
    const pid = (await readFile(path.join(state.data, 'postmaster.pid'), 'utf8')).split(/\r?\n/);
    if (await realpath(pid[1]) !== await realpath(state.data) || Number(pid[3]) !== state.pgPort) throw new Error('Staging process identity mismatch');
    const db = client(state, 'control');
    try {
        const [identity] = await db.$queryRawUnsafe("SELECT system_identifier::text AS id,current_setting('data_directory') AS directory,inet_server_port() AS port,host(inet_server_addr()) AS address,current_user AS role FROM pg_control_system()");
        if (identity.id !== state.systemId || await realpath(identity.directory) !== await realpath(state.data)
            || identity.port !== state.pgPort || identity.address !== '127.0.0.1' || identity.role !== state.credentials.admin.user) {
            throw new Error('Staging server identity mismatch');
        }
    } finally { await db.$disconnect(); }
}
export async function assertTarget(state, name, { write = false, initialize = false } = {}) {
    const target = state.databases[name];
    if (!target || (write && !['runtime', 'disposable'].includes(target.purpose) && !initialize)) throw new Error('Staging target is protected');
    await assertCluster(state);
    const db = client(state, name);
    try {
        const [row] = await db.$queryRaw`SELECT current_database() AS name,shobj_description(oid,'pg_database') AS marker,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()`;
        if (row.name !== target.name || row.marker !== `NEXLIFT_STAGE:${state.id}:${target.purpose}` || row.owner !== state.credentials.admin.user) throw new Error('Staging database identity mismatch');
        if (initialize) {
            const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
            if (tables.length) throw new Error('Initialization requires an empty staging database');
        }
    } finally { await db.$disconnect(); }
}
