import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const auditDir = fileURLToPath(new URL('./', import.meta.url));
export const serverDir = fileURLToPath(new URL('../../', import.meta.url));
export const schemaPath = path.join(serverDir, 'prisma/schema.prisma');
export const pgExecutable = name => {
    const bin = process.env.NEXLIFT_TEST_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
    return bin ? path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
};
export function cleanEnvironment() {
    return Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        !/^(PG|DATABASE_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$|PRISMA_)/i.test(key)));
}
export function runPg(name, args, { env = cleanEnvironment(), ...options } = {}) {
    const result = spawnSync(pgExecutable(name), args, { windowsHide: true, encoding: 'utf8', env, ...options });
    // Do not echo command arguments, environment, SQL or libpq error text: these
    // can contain secrets when the future authorized-copy wrapper is used.
    if (result.error || result.status !== 0) throw new Error(`${name} failed (exit ${result.status ?? 'unavailable'}). No connection details printed.`);
    return result.stdout;
}
export function inspectSql(file, connection) {
    if (!['catalog.sql','counts-and-orphans.sql','declared-orphans.sql','diagnostics.sql'].includes(file)) throw new Error('Unknown audit script');
    const result = runPg('psql', ['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1', ...connection.args, '-f', path.join(auditDir,file)], {
        env: { ...cleanEnvironment(), ...connection.env, PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000' }
    });
    return result.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}
export const stable = value => JSON.stringify(value, function (key, val) {
    return val && !Array.isArray(val) && typeof val === 'object'
        ? Object.fromEntries(Object.entries(val).sort(([a],[b]) => a.localeCompare(b))) : val;
});
export function compareCatalog(expected, actual) {
    const differences = [];
    for (const section of ['tables','columns','foreignKeys','indexes','constraints','extras']) {
        const key = row => [row.kind || '',row.table || '',row.name].join(':');
        const exp = new Map(expected[section].map(row => [key(row),row]));
        const act = new Map(actual[section].map(row => [key(row),row]));
        for (const [id,row] of exp) {
            if (!act.has(id)) differences.push({ section, key: id, difference: 'missing' });
            else if (stable(row) !== stable(act.get(id))) differences.push({ section, key: id, difference: 'changed', expected: row, actual: act.get(id) });
        }
        for (const id of act.keys()) if (!exp.has(id)) differences.push({ section, key: id, difference: 'extra' });
    }
    return differences;
}
export function canRunDiagnostics(expected, actual) {
    const columns = new Map(actual.columns.map(c => [`${c.table}.${c.name}`,c]));
    return expected.columns.every(c => {
        const a = columns.get(`${c.table}.${c.name}`);
        return a && a.type === c.type && a.nullable === c.nullable;
    });
}
export const loadDeclared = () => JSON.parse(readFileSync(path.join(auditDir,'declared-catalog.json'),'utf8'));
