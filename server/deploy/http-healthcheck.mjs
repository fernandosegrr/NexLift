// Runtime healthcheck: readiness, no sensitive output, hard wall-clock bound.
try {
    const port = process.env.PORT || '3001';
    if (!/^\d+$/.test(port) || +port < 1 || +port > 65535) throw new Error('Invalid port');
    const response = await fetch(`http://127.0.0.1:${port}/api/ready`, { signal: AbortSignal.timeout(6000) });
    const body = await response.json();
    if (response.status !== 200 || body.status !== 'ready') process.exitCode = 1;
} catch { process.exitCode = 1; }
