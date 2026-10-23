// Same 31 historical assertions, rerun through the complete Fastify backend.
process.env.NEXLIFT_TEST_TRANSPORT = 'fastify';
await import('./run-stabilization-integration.mjs');
