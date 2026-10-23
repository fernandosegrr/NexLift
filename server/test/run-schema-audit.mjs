// Build the FULL unchanged Prisma schema in TWO new throwaway databases.
// Never loads .env, accepts a connection URL, or activates Prisma migrations.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { auditDir, serverDir, schemaPath, cleanEnvironment, runPg, inspectSql, compareCatalog, stable } from '../audit/postgresql/audit-tools.mjs';

const args = process.argv.slice(2);
const refresh = args.includes('--refresh-declared-artifacts');
if (args.some(arg => arg !== '--refresh-declared-artifacts')) throw new Error('Unknown argument; URLs are not accepted');
const schema = readFileSync(schemaPath,'utf8').replace(/\r\n/g,'\n');
const schemaSha256 = createHash('sha256').update(schema).digest('hex');
const versions = Object.fromEntries(['prisma','@prisma/client'].map(n => [n,JSON.parse(readFileSync(path.join(serverDir,'node_modules',n,'package.json'),'utf8')).version]));
if (Object.values(versions).some(v => !v.startsWith('6.'))) throw new Error('This audit requires the locally installed Prisma 6 CLI and Client');
const probe = net.createServer();
await new Promise((resolve,reject) => { probe.once('error',reject); probe.listen(0,'127.0.0.1',resolve); });
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const tempRoot = realpathSync(tmpdir());
const root = mkdtempSync(path.join(tempRoot,'nexlift-schema-audit-'));
const data = path.join(root,'data');
const username = 'nexlift_schema_audit';
const database = 'nexlift_schema_audit';
let started = false;
try {
    // Copy the schema away from server/.env before invoking the CLI.
    const isolatedSchema = path.join(root,'schema.prisma');
    writeFileSync(isolatedSchema,schema);
    const diff = spawnSync(process.execPath,[path.join(serverDir,'node_modules/prisma/build/index.js'),
        'migrate','diff','--from-empty','--to-schema-datamodel',isolatedSchema,'--script'], {
        cwd: root, windowsHide: true, encoding: 'utf8',
        env: { ...cleanEnvironment(), DATABASE_URL: '', PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' }
    });
    if (diff.error || diff.status !== 0) throw new Error('Offline Prisma diff failed; no connection attempted');
    const sql = '-- AUDIT ONLY: generated from the declared schema, NOT an approved existing-database baseline.\n' + diff.stdout.replace(/\r\n/g,'\n');
    if ((sql.match(/CREATE TABLE /g) || []).length !== 17 || /DROP TABLE|TRUNCATE|DELETE FROM/i.test(sql)) throw new Error('Unexpected schema reconstruction SQL');
    const sqlFile = path.join(root,'declared-schema.sql');
    writeFileSync(sqlFile,sql);
    runPg('initdb',['-D',data,'-U',username,'--auth=trust','--no-locale','--encoding=UTF8']);
    runPg('pg_ctl',['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],{stdio:'ignore'});
    started = true;
    const connection = { args: ['-h','127.0.0.1','-p',String(port),'-U',username,'-d',database] };
    const serviceFile = path.join(root,'audit.pg_service.conf');
    writeFileSync(serviceFile,`[nexlift_synthetic_copy]\nhost=127.0.0.1\nport=${port}\nuser=${username}\ndbname=${database}\n`,{mode:0o600});
    for (const db of [database,'nexlift_schema_rebuild']) {
        runPg('createdb',['-h','127.0.0.1','-p',String(port),'-U',username,db]);
        runPg('psql',['-X','-w','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U',username,'-d',db,'-1','-f',sqlFile]);
    }
    const [catalog] = inspectSql('catalog.sql',connection);
    if (refresh) {
        writeFileSync(path.join(auditDir,'declared-schema.sql'),sql);
        writeFileSync(path.join(auditDir,'declared-catalog.json'),JSON.stringify({
            environment: 'fresh synthetic PostgreSQL; declared schema only; not production', schemaSha256, versions,
            postgres: runPg('postgres',['--version']).trim(), catalog
        },null,2)+'\n');
        const quote = name => '"' + name.replaceAll('"','""') + '"';
        const orphans = catalog.foreignKeys.map(f => {
            const equality = f.columns.map((c,i) => `pa.${quote(f.referencedColumns[i])}=ch.${quote(c)}`).join(' AND ');
            const nonnull = f.columns.map(c => `ch.${quote(c)} IS NOT NULL`).join(' AND ');
            return `SELECT jsonb_build_object('check','declared_orphan_fk','table','${f.table}','constraint','${f.name}','count',count(*)) FROM public.${quote(f.table)} ch WHERE ${nonnull} AND NOT EXISTS (SELECT 1 FROM public.${quote(f.referencedTable)} pa WHERE ${equality});`;
        });
        writeFileSync(path.join(auditDir,'declared-orphans.sql'),[
            '-- Generated from declared FKs. Checks remain effective even when an installed FK is missing.',
            'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',"SET LOCAL statement_timeout = '30s';", "SET LOCAL lock_timeout = '2s';",'SET LOCAL search_path = pg_catalog;',...orphans,'COMMIT;',''
        ].join('\n'));
        const modelBlocks = [...schema.matchAll(/model (\w+) \{([\s\S]*?)^\}/gm)];
        const markdown = ['# Inventario completo declarado y reconstruido — Fase 2.1','',
            'Generado en PostgreSQL desechable desde `schema.prisma`, sin cambios. No describe producción.',
            '',`SHA-256 del archivo: \`${schemaSha256}\`. CLI ${versions.prisma}; Client ${versions['@prisma/client']}.`,
            '', 'Las columnas se muestran con tipos, nulabilidad y defaults REALES del PostgreSQL reconstruido. Los defaults Prisma y `@updatedAt` también se indican: no todos existen en SQL.',''];
        for (const [,name,body] of modelBlocks) {
            markdown.push(`## ${name}`,'','| Columna | Tipo PostgreSQL | NULL | Default SQL | Declaración Prisma |','|---|---|---|---|---|');
            for (const c of catalog.columns.filter(c => c.table===name)) {
                const declaration = body.split(/\r?\n/).map(l=>l.trim()).find(l=>l.startsWith(c.name+' '))?.split('//')[0].trim() || '';
                markdown.push(`| ${c.name} | ${c.type} | ${c.nullable?'sí':'no'} | ${c.default ?? '—'} | \`${declaration}\` |`);
            }
            markdown.push('','Índices (incluyen PK y únicos):','');
            for (const i of catalog.indexes.filter(i=>i.table===name)) markdown.push(`- \`${i.definition}\``);
            markdown.push('','FK salientes:','');
            for (const f of catalog.foreignKeys.filter(f=>f.table===name)) markdown.push(`- \`${f.columns.join(',')} → ${f.referencedTable}(${f.referencedColumns.join(',')})\`; DELETE ${f.onDelete}; UPDATE ${f.onUpdate}; validada ${f.validated}; diferible ${f.deferrable}.`);
            if (!catalog.foreignKeys.some(f=>f.table===name)) markdown.push('- Ninguna.');
            markdown.push('');
        }
        writeFileSync(path.join(auditDir,'INVENTORY.md'),markdown.join('\n'));
    } else {
        const expected = JSON.parse(readFileSync(path.join(auditDir,'declared-catalog.json'),'utf8'));
        if (expected.schemaSha256 !== schemaSha256 || stable(expected.versions)!==stable(versions)
            || compareCatalog(expected.catalog,catalog).length || readFileSync(path.join(auditDir,'declared-schema.sql'),'utf8')!==sql) {
            throw new Error('Declared artifacts differ. Review schema/toolchain before explicit --refresh-declared-artifacts on disposable databases.');
        }
    }
    console.log(`Isolated full-schema reconstruction: ${catalog.tables.length} tables; ${catalog.columns.length} columns; ${catalog.foreignKeys.length} FKs; ${catalog.indexes.length} indexes. No existing database used.`);
    const result = spawnSync(process.execPath,['--test','--test-reporter=spec','test/schema-audit.integration.test.js'], {
        cwd: serverDir, windowsHide: true, stdio: 'inherit', env: { ...cleanEnvironment(),
            DATABASE_URL: `postgresql://${username}@127.0.0.1:${port}/${database}`,
            NEXLIFT_SCHEMA_AUDIT_PORT: String(port), NEXLIFT_SCHEMA_AUDIT_SERVICE_FILE: serviceFile, NODE_ENV: 'test', OPENAI_API_KEY: '' }
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} finally {
    if (started || existsSync(path.join(data,'postmaster.pid'))) runPg('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    const resolvedRoot = realpathSync(root);
    if (path.dirname(resolvedRoot)===tempRoot && path.basename(resolvedRoot).startsWith('nexlift-schema-audit-')) rmSync(resolvedRoot,{recursive:true,force:true});
}
