// Windows does not deliver POSIX SIGTERM through child.kill. IPC emits the same
// signal event inside this disposable test process; no test hook in production.
process.on('message', message => { if (message === 'SIGTERM') process.emit('SIGTERM'); });
await import('../../deploy/rehearsal-http.mjs');
