// Reproducible clean-install verification, outside the working tree. No .env,
// existing node_modules, archives or inherited application credentials are used.
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';

if (process.versions.node !== '24.22.0' || process.argv.length !== 2) throw new Error('Run with Node 24.22.0, without arguments');
const source = fileURLToPath(new URL('../../', import.meta.url));
const parent = await realpath(tmpdir());
const root = await mkdtemp(path.join(parent,'nexlift-node24-verification-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|HOME|NEXLIFT_TEST_PG_BIN)$/i.test(name)));
env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${env.PATH || env.Path || ''}`;
Object.assign(env, { CI: 'true', DATABASE_URL: '', NODE_ENV: 'test', PRISMA_SKIP_POSTINSTALL_GENERATE: 'true',
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1', npm_config_registry: 'https://registry.npmjs.org' });
const npm = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
const results = [];
const filter = name => !['node_modules','dist','.git'].includes(path.basename(name)) && !path.basename(name).startsWith('.env');
let passed = false;
try {
    for (const dir of ['server','client']) {
        await mkdir(path.join(root,dir));
        const entries = dir === 'server'
            ? ['package.json','package-lock.json','src','test','prisma','audit','deploy','postgres-recovery.mjs','restore-backup.mjs']
            : ['package.json','package-lock.json','src','public','test','index.html','vite.config.js','vitest.config.js','eslint.config.js'];
        for (const entry of entries) await cp(path.join(source,dir,entry), path.join(root,dir,entry), { recursive: true, filter });
    }
    for (const file of ['Dockerfile','Dockerfile.rehearsal','.dockerignore','.gitignore']) await cp(path.join(source,file), path.join(root,file));
    const run = async (name, args, cwd) => {
        const start = Date.now();
        const result = spawnSync(process.execPath, args, { cwd: path.join(root,cwd), env, windowsHide: true, encoding: 'utf8', maxBuffer: 16*1024*1024, timeout: 300000 });
        const log = (result.stdout || '') + (result.stderr || '');
        await writeFile(path.join(root, `${name}.log`), log);
        const plain = stripVTControlCharacters(log);
        const summary = { name, exit: result.status, milliseconds: Date.now()-start,
            tests: Number(plain.match(/(?:ℹ |# )tests (\d+)/)?.[1] || plain.match(/Tests\s+(\d+) passed/)?.[1] || 0) };
        results.push(summary); process.stdout.write(`${JSON.stringify(summary)}\n`);
        if (result.error || result.status !== 0) throw new Error(`${name} failed; isolated log: ${path.join(root,`${name}.log`)}\n${log.slice(-7000)}`);
    };
    await run('server-ci', [npm,'ci','--no-audit','--no-fund'], 'server');
    await run('client-ci', [npm,'ci','--no-audit','--no-fund'], 'client');
    await run('prisma-generate', ['node_modules/prisma/build/index.js','generate'], 'server');
    for (const script of ['test','test:integration','test:backup','test:backup:integration','test:import',
        'test:import:integration','test:workout:integration','test:workout:baseline','test:schema:audit','test:baseline','test:infra','test:infra:integration']) {
        await run(`server-${script.replaceAll(':','-')}`, [npm,'run',script], 'server');
    }
    await run('client-tests', [npm,'test'], 'client');
    await run('client-build', [npm,'run','build'], 'client');
    await run('infra-static', ['test/check-infrastructure.mjs'], 'server');
    const prismaCliVersion = JSON.parse(await readFile(path.join(root,'server/node_modules/prisma/package.json'))).version;
    // Same pruning as the runtime Docker stage. Exercise the native query engine
    // and routine API handlers again with production dependencies only.
    await run('production-prune', [npm,'prune','--omit=dev','--ignore-scripts','--no-audit','--no-fund'], 'server');
    await run('production-deps-smoke', [npm,'run','test:integration'], 'server');
    const artifacts = {};
    for (const file of ['Dockerfile.rehearsal','.dockerignore','server/package-lock.json','client/package-lock.json',
        'server/prisma/schema.prisma','server/prisma/migrations/0_init/migration.sql','server/src/index.js',
        'server/src/middleware/auth.js','server/test/infra-operations.test.js']) {
        artifacts[file] = createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
    }
    const evidence = { node: process.versions.node, openssl: process.versions.openssl, platform: process.platform, arch: process.arch,
        npm: JSON.parse(await readFile(path.join(path.dirname(npm),'../package.json'))).version,
        prismaCli: prismaCliVersion,
        prismaClient: JSON.parse(await readFile(path.join(root,'server/node_modules/@prisma/client/package.json'))).version,
        results, uniqueTests: results.filter(r=>r.name!=='production-deps-smoke').reduce((sum,r)=>sum+r.tests,0),
        repeatedSmokeTests: results.find(r=>r.name==='production-deps-smoke').tests, artifacts, dockerImageExecuted: false };
    await mkdir(path.join(source,'server/audit/infrastructure'), { recursive: true });
    await writeFile(path.join(source,'server/audit/infrastructure/node24-evidence.json'), `${JSON.stringify(evidence,null,2)}\n`);
    passed = true;
} finally {
    // Failed copies retain only synthetic logs/artifacts for diagnosis. On success
    // remove exactly this verified direct child, never a computed external path.
    const resolved = await realpath(root);
    if (passed && path.dirname(resolved) === parent && path.basename(resolved).startsWith('nexlift-node24-verification-')) {
        await rm(resolved, { recursive: true, force: true });
    } else process.stderr.write(`Isolated verification directory retained: ${root}\n`);
}
