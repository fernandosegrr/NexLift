// Only reviewed labels and fixed messages may reach operational logs.
// Never serialize the original error, stack, URL, environment or SQL.
const fields = new Set(['NODE_ENV', 'NEXLIFT_HTTP_TRANSPORT', 'NEXLIFT_FASTIFY_ACTIVATION',
    'NEXLIFT_RELEASE_MODE', 'JWT_SECRET', 'NEXLIFT_RELEASE_DATABASE_URL', 'NEXLIFT_REPLICAS',
    'NEXLIFT_OFFLINE_SYNC_ENABLED', 'NEXLIFT_CONFLICT_RESOLUTION_ENABLED', 'NEXLIFT_WEB_SESSION_REHEARSAL',
    'NEXLIFT_BACKUP_PRUNE_ENABLED', 'PORT', 'NEXLIFT_BIND_HOST', 'NEXLIFT_TRUSTED_PROXY_CIDRS', 'CORS_ORIGIN']);
const schemaReasons = new Map([
    ['Falta registrar el historial de migraciones.', 'MIGRATION_HISTORY_MISSING'],
    ['Metadatos de migración con columnas incompatibles.', 'MIGRATION_HISTORY_INCOMPATIBLE'],
    ['Historial de migraciones inconsistente o incompatible con el código.', 'MIGRATION_HISTORY_INCOMPATIBLE'],
    ['Hay migraciones requeridas pendientes.', 'MIGRATIONS_PENDING'],
    ['Esquema incompatible: readiness rechazada.', 'SCHEMA_MISMATCH'],
    ['Operation journal schema incompatible', 'OPERATION_JOURNAL_MISMATCH']
]);
const dependencyReasons = new Map([
    ['P1000', ['DATABASE_AUTHENTICATION_FAILED', 'Database authentication was rejected. Check runtime secrets without printing them.']],
    ['P1001', ['DATABASE_UNREACHABLE', 'Database is unreachable. Check the private host, port and network.']],
    ['P1002', ['DATABASE_TIMEOUT', 'Database connection timed out. Check availability and the private network.']],
    ['P1010', ['DATABASE_PERMISSION_DENIED', 'Database access was denied. Review the application role permissions.']],
    ['P2021', ['DATABASE_TABLE_MISSING', 'A required table is missing. Review the schema; no automatic repair was attempted.']],
    ['P2022', ['DATABASE_COLUMN_MISSING', 'A required column is missing. Review the schema; no automatic repair was attempted.']],
    ['ENOENT', ['RELEASE_ARTIFACT_MISSING', 'A required release file is missing. Verify the image contents.']],
    ['ERR_MODULE_NOT_FOUND', ['RUNTIME_MODULE_MISSING', 'A runtime module is missing. Verify the image contents and production dependencies.']],
    ['MODULE_NOT_FOUND', ['RUNTIME_MODULE_MISSING', 'A runtime module is missing. Verify the image contents and production dependencies.']],
    ['EADDRINUSE', ['HTTP_PORT_IN_USE', 'The configured HTTP port is already in use.']],
    ['EACCES', ['RUNTIME_PERMISSION_DENIED', 'A required runtime resource denied access. Review port and filesystem permissions.']]
]);

export function diagnoseStartup(error) {
    const field = typeof error?.message === 'string'
        ? /^Release configuration rejected: ([A-Z_]+)$/.exec(error.message)?.[1] : undefined;
    if (fields.has(field)) return { code: 'RELEASE_CONFIGURATION_REJECTED', field,
        message: 'Required runtime configuration is missing or invalid. Check this variable in the service environment.' };
    const schema = schemaReasons.get(error?.message);
    if (schema) return { code: schema,
        message: 'Schema preflight rejected startup. Preserve data and review the baseline separately; do not run db push or force migrations.' };
    const dependency = dependencyReasons.get(error?.code) || dependencyReasons.get(error?.errorCode);
    if (dependency) return { code: dependency[0], message: dependency[1] };
    return { code: 'STARTUP_DEPENDENCY_FAILED',
        message: 'Startup failed. Review runtime configuration, image contents and schema readiness; original error details are withheld.' };
}

export function logStartupFailure(error, write = line => process.stderr.write(line)) {
    write(JSON.stringify({ timestamp: new Date().toISOString(), event: 'startup_failed',
        category: 'configuration_or_dependency', ...diagnoseStartup(error) }) + '\n');
}
