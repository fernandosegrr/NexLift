import { installEgressGuard } from '../../staging/egress.mjs';
if (process.env.NEXLIFT_INFRA_REHEARSAL !== 'true' || process.env.NODE_ENV !== 'development' ||
    new URL(process.env.DATABASE_URL).hostname !== '127.0.0.1') throw new Error('Disposable development fixture required');
installEgressGuard();
// Windows IPC delivers the same application shutdown signal without killing PG.
process.on('message', message => { if (message === 'SIGTERM') process.emit('SIGTERM'); });
