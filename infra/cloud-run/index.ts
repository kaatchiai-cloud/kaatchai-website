import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN_CLOUDRUN;
const GIT_SHA = process.env.K_REVISION ?? 'dev-local';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: GIT_SHA,
    environment: process.env.K_SERVICE ? 'production' : 'development',
  });
}

const app = new Hono();

app.get('/v1/health', (c) => {
  return c.json({ ok: true, revision: GIT_SHA, ts: Date.now() });
});

app.post('/v1/sentry-smoke', () => {
  throw new Error('smoke-test-cloud-run');
});

app.onError((err, c) => {
  if (SENTRY_DSN) {
    Sentry.captureException(err);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port });
console.log(`Hono server listening on port ${port}`);
