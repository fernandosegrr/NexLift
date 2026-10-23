// Opt-in synthetic-only Docker gate. No existing URLs, volumes or services used.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
assert.equal(process.argv.length, 2, 'No external target accepted');
assert.equal(process.env.NEXLIFT_DOCKER_REHEARSAL, 'true', 'Explicit isolated Docker rehearsal required');
const suffix = randomUUID().replaceAll('-', ''), prefix = `nexlift-release-${suffix}`;
const database = `nexlift_ops_test_phase6_${suffix}`, marker = `NEXLIFT_PHASE31_DISPOSABLE:${randomUUID()}`;
const resources = [], results = [];
function docker(args, input) {
    const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 1200000, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error(`Docker rehearsal failed at ${args[0]}; no production target used`);
    return result.stdout.trim();
}
async function probe(app) {
    const script = `const r=await fetch('http://127.0.0.1:3001/api/ready');if(r.status!==200)process.exit(1);if(!(await(await fetch('http://127.0.0.1:3001/')).text()).includes('<html'))process.exit(1);if((await fetch('http://127.0.0.1:3001/sw.js')).status!==200)process.exit(1);`;
    for (let attempt = 0; attempt < 60; attempt++) {
        const result = spawnSync('docker', ['exec', app, 'node', '--input-type=module', '-e', script], { encoding: 'utf8', windowsHide: true });
        if (result.status === 0) return;
        await delay(1000);
    }
    throw new Error('Readiness/SPA deadline');
}
try {
    docker(['info', '--format', '{{.OSType}}']);
    docker(['build', '-f', 'Dockerfile.release', '--target', 'runtime', '-t', `${prefix}:http`, '.']);
    docker(['build', '-f', 'Dockerfile.release', '--target', 'migration-job', '-t', `${prefix}:migration`, '.']);
    docker(['network', 'create', '--internal', prefix]); resources.push(['network', prefix]);
    const db = `${prefix}-db`;
    docker(['run', '-d', '--name', db, '--network', prefix, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:18.4-bookworm@sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382']); resources.push(['container', db]);
    let databaseReady = false;
    for (let attempt = 0; attempt < 60; attempt++) {
        const p = spawnSync('docker', ['exec', db, 'pg_isready', '-U', 'postgres'], { windowsHide: true });
        if (p.status === 0) { databaseReady = true; break; } await delay(1000);
    }
    assert(databaseReady, 'Disposable PostgreSQL unavailable');
    docker(['exec', '-i', db, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], `CREATE DATABASE ${database};\nCOMMENT ON DATABASE ${database} IS '${marker}';\nALTER DATABASE ${database} SET nexlift.phase31_disposable TO '${marker}';\nALTER DATABASE ${database} SET nexlift.phase6_disposable TO '${marker}';\n`);
    const common = ['-e', 'NODE_ENV=production', '-e', 'NEXLIFT_RELEASE_MODE=rehearsal', '-e', `NEXLIFT_RELEASE_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/${database}`,
        '-e', `NEXLIFT_DISPOSABLE_MARKER=${marker}`, '-e', 'NEXLIFT_REPLICAS=1', '-e', `JWT_SECRET=${randomUUID()}${randomUUID()}`];
    docker(['run', '--rm', '--network', `container:${db}`, ...common, `${prefix}:migration`]);
    for (const transport of ['express', 'fastify']) {
        const app = `${prefix}-${transport}`;
        docker(['run', '-d', '--name', app, '--network', `container:${db}`, '--read-only', '--tmpfs', '/tmp', '--cap-drop=ALL', '--security-opt=no-new-privileges',
            ...common, '-e', `NEXLIFT_HTTP_TRANSPORT=${transport}`, '-e', 'NEXLIFT_FASTIFY_ACTIVATION=reviewed-v4', `${prefix}:http`]); resources.push(['container', app]);
        await probe(app);
        docker(['exec', app, 'node', '--input-type=module', '-e', "import fs from 'node:fs';if(process.getuid()===0||fs.existsSync('node_modules/prisma')||fs.existsSync('node_modules/typescript'))process.exit(1)"]);
        docker(['restart', '--time', '15', app]); await probe(app);
        docker(['stop', '--time', '15', app]);
        assert.equal(docker(['inspect', '--format', '{{.State.ExitCode}}', app]), '0');
        assert.match(docker(['logs', app]), /shutdown_complete/);
        results.push({ transport, readiness: true, spa: true, sw: true, nonRoot: true, noDevDependencies: true, restart: true, sigtermExit: 0 });
    }
    await mkdir('server/audit/release', { recursive: true });
    await writeFile('server/audit/release/docker-evidence.json', JSON.stringify({ dockerExecuted: true, results,
        image: docker(['image', 'inspect', '--format', '{{.Id}}', `${prefix}:http`]),
        note: 'Disposable Linux smoke; functional jobs, restore and full HTTP matrix run separately. PostgreSQL base is locked by manifest digest; inspect actual architecture and layers.' }, null, 2));
} finally {
    // Only resources just created by this unique invocation; no host paths,
    // user containers, existing volumes or protected directories are removed.
    for (const [kind, name] of resources.reverse()) docker(kind === 'container' ? ['rm', '-f', '-v', name] : ['network', 'rm', name]);
}
