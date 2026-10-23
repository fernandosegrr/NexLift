// Compose-only bootstrap: fixed private service/database, random marker and an
// independent role per secret. HTTP never receives the migration credential.
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { installEgressGuard } from './egress.mjs';

try {
    const mode = process.argv[2]; if (!['job', 'http'].includes(mode)) throw new Error();
    const config = JSON.parse(await readFile(`/run/secrets/${mode === 'job' ? 'job_config' : 'app_config'}`, 'utf8'));
    const url = new URL(config.url), role = mode === 'job' ? 'nexlift_stage_admin' : 'nexlift_stage_app';
    if (url.hostname !== 'db' || (url.port && url.port !== '5432') || url.pathname !== '/nexlift_stage_runtime'
        || url.username !== role || !/^[a-f0-9]{32}$/.test(config.marker || '')) throw new Error();
    const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
    try {
        const [row] = await prisma.$queryRawUnsafe("SELECT system_identifier::text AS id,current_database() AS db,current_user AS role,shobj_description(d.oid,'pg_database') AS marker FROM pg_control_system() CROSS JOIN pg_database d WHERE d.datname=current_database()");
        if (row.db !== 'nexlift_stage_runtime' || row.role !== role || row.marker !== `NEXLIFT_STAGE_COMPOSE:${config.marker}`) throw new Error();
        const identity = `/stage-identity/${config.marker}.id`;
        if (mode === 'job') {
            try { await writeFile(identity, row.id, { flag: 'wx', mode: 0o644 }); }
            catch (error) { if (error.code !== 'EEXIST') throw error; }
        }
        if (await readFile(identity, 'utf8') !== row.id) throw new Error();
        if (mode === 'job') {
            const { rehearsalMigrate } = await import('../deploy/rehearsal-migrate.mjs');
            await rehearsalMigrate({ NEXLIFT_INFRA_REHEARSAL: 'true', NEXLIFT_RELEASE_DATABASE_URL: url.href, PATH: process.env.PATH });
            await prisma.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
            await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO nexlift_stage_app');
            await prisma.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexlift_stage_app');
            await prisma.$executeRawUnsafe('REVOKE INSERT,UPDATE,DELETE ON public._prisma_migrations FROM nexlift_stage_app');
        }
    } finally { await prisma.$disconnect(); }
    if (mode === 'http') {
        Object.assign(process.env, { DATABASE_URL: url.href, NEXLIFT_RELEASE_DATABASE_URL: url.href, NEXLIFT_INFRA_REHEARSAL: 'true',
            JWT_SECRET: config.jwtSecret, NODE_ENV: 'production', PORT: '3001', OPENAI_API_KEY: '',
            CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' });
        installEgressGuard({ databaseHost: 'db' });
        await import('../deploy/rehearsal-http.mjs');
    }
} catch { process.stderr.write('{"event":"compose_staging_blocked"}\n'); process.exitCode = 1; }
