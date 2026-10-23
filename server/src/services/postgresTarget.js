import { lookup } from 'node:dns/promises';
import { BackupError } from './backupFormat.js';

// Verify the explicitly supplied URL and Prisma client identify the same server,
// database and role before invoking a separate libpq process. No env fallback.
export async function assertExplicitTarget(prisma,url) {
    let parsed;
    try { parsed=new URL(url); } catch { throw new BackupError('Destino PostgreSQL explícito inválido.'); }
    if(!['postgresql:','postgres:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.pathname.slice(1)) throw new BackupError('Destino PostgreSQL explícito inválido.');
    const [actual]=await prisma.$queryRaw`SELECT current_database() AS db,current_user AS role,inet_server_port() AS port,host(inet_server_addr()) AS address`;
    const addresses=await lookup(parsed.hostname.replace(/^\[|\]$/g,''),{all:true});
    const normalize=s=>s?.replace(/^::ffff:/,'');
    if(actual.db!==decodeURIComponent(parsed.pathname.slice(1)) || actual.role!==decodeURIComponent(parsed.username)
        || actual.port!==Number(parsed.port || 5432) || !addresses.some(a=>normalize(a.address)===normalize(actual.address))) throw new BackupError('Cliente y destino PostgreSQL no coinciden.',409);
}
export async function assertEmptyTarget(prisma) {
    const rows=await prisma.$queryRaw`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r','p','v','m','S','f')`;
    if(rows.length) throw new BackupError('La restauración requiere una base nueva vacía; no se reemplazará.',409);
}
