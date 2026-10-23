import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { stageHome, secret } from './environment.mjs';
import { protectDirectory } from './local.mjs';

if (process.argv.length !== 2) throw new Error('No arguments or external URLs accepted');
const root = path.join(stageHome(), 'compose-private');
await mkdir(root, { mode: 0o700 }); await protectDirectory(root);
const admin = secret(), app = secret(), marker = randomBytes(16).toString('hex');
const jobURL = `postgresql://nexlift_stage_admin:${admin}@db:5432/nexlift_stage_runtime`;
const appURL = `postgresql://nexlift_stage_app:${app}@db:5432/nexlift_stage_runtime`;
for (const [file, value] of Object.entries({ 'pg-password.private': admin,
    'job.private.json': JSON.stringify({ url: jobURL, marker }), 'app.private.json': JSON.stringify({ url: appURL, marker, jwtSecret: secret() }),
    'init.private.sql': `CREATE ROLE nexlift_stage_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${app}';\nREVOKE ALL ON DATABASE nexlift_stage_runtime FROM PUBLIC;\nGRANT CONNECT ON DATABASE nexlift_stage_runtime TO nexlift_stage_app;\nCOMMENT ON DATABASE nexlift_stage_runtime IS 'NEXLIFT_STAGE_COMPOSE:${marker}';\nGRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO nexlift_stage_app;\n` })) {
    await writeFile(path.join(root, file), value, { flag: 'wx', mode: 0o600 });
}
process.stdout.write(`Private Compose files created: ${root}\nSet NEXLIFT_STAGE_COMPOSE_SECRETS to this directory. Do not print docker compose config.\n`);
