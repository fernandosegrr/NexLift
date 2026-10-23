// Future container readiness command, not wired into current health/production.
import {PrismaClient} from '@prisma/client';
import {assertSchemaReady} from './releaseGate.js';
const url=process.env.NEXLIFT_RELEASE_DATABASE_URL;
if(!url) {process.stderr.write('Destino de readiness explícito requerido.\n');process.exitCode=1;}
else {
    const prisma=new PrismaClient({datasources:{db:{url}}});
    try {await assertSchemaReady(prisma);process.stdout.write('ready\n');}
    catch {process.stderr.write('not ready\n');process.exitCode=1;}
    finally {await prisma.$disconnect();}
}
