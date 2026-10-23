// Alternative startup proposal. NOT referenced by the production Dockerfile.
// Requires an explicit release URL; never falls back to DATABASE_URL or .env.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {assertSchemaReady} from './releaseGate.js';

export async function startChecked({url,start}) {
    if(!url) throw new Error('Falta el destino explícito de release. No se arrancó la aplicación.');
    const prisma=new PrismaClient({datasources:{db:{url}}});
    try {await assertSchemaReady(prisma);}
    finally {await prisma.$disconnect();}
    return start();
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
    try {
        const url=process.env.NEXLIFT_RELEASE_DATABASE_URL;
        await startChecked({url,start:()=>new Promise((resolve,reject)=>{
            const child=spawn(process.execPath,[fileURLToPath(new URL('../src/index.js',import.meta.url))],{
                windowsHide:true,stdio:'inherit',env:{...process.env,DATABASE_URL:url}
            });
            const forward=signal=>{if(!child.killed) child.kill(signal);};
            const onTerm=()=>forward('SIGTERM'),onInt=()=>forward('SIGINT');
            process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);
            child.on('error',reject);
            child.on('exit',code=>{process.off('SIGTERM',onTerm);process.off('SIGINT',onInt);process.exitCode=code ?? 1;resolve();});
        })});
    } catch {process.stderr.write('Esquema no compatible o arranque fallido. No se ejecutaron migraciones automáticas.\n');process.exitCode=1;}
}
