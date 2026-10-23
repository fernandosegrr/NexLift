// NO default connection; NO .env; NO DATABASE_URL; NO arbitrary SQL or DDL.
// This tool is prepared for a future explicitly authorized staging copy.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectSql, compareCatalog, canRunDiagnostics, loadDeclared } from './audit-tools.mjs';

export function parseInspectionArgs(args) {
    const options = {};
    for (const arg of args) {
        if (arg === '--confirm-authorized-copy') options.confirm = true;
        else if (arg.startsWith('--service-file=')) options.file = arg.slice('--service-file='.length);
        else if (arg.startsWith('--service=')) options.service = arg.slice('--service='.length);
        else throw new Error('Unsupported argument. Connection URLs are not accepted.');
    }
    if (!options.confirm || !options.file || !path.isAbsolute(options.file) || !existsSync(options.file)
        || !/^[a-zA-Z0-9_-]+$/.test(options.service || '')) {
        throw new Error('Requires --confirm-authorized-copy, an existing absolute --service-file and --service name. No connection attempted.');
    }
    return options;
}
export function inspectCopy(args) {
    const { file, service } = parseInspectionArgs(args);
    const connection = { args: [], env: { PGSERVICEFILE: file, PGSERVICE: service, PGCONNECT_TIMEOUT: '5' } };
    const declared = loadDeclared();
    const [actual] = inspectSql('catalog.sql',connection);
    const diagnosticsAvailable = canRunDiagnostics(declared.catalog,actual);
    return { environment: 'operator-selected authorized copy; not verified production',
        expectedSchemaHash: declared.schemaSha256, actual,
        differences: compareCatalog(declared.catalog,actual),
        countsAndOrphans: inspectSql('counts-and-orphans.sql',connection),
        declaredOrphans: diagnosticsAvailable ? inspectSql('declared-orphans.sql',connection) : [],
        diagnostics: diagnosticsAvailable ? inspectSql('diagnostics.sql',connection) : [],
        diagnosticsSkipped: diagnosticsAvailable ? null : 'Missing or incompatible columns. Review catalog differences first.',
        consistency: 'Each script has its own repeatable-read snapshot. Quiesce writes for a cross-script comparison.' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { process.stdout.write(JSON.stringify(inspectCopy(process.argv.slice(2)),null,2) + '\n'); }
    catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
