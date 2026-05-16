# Sentry — Stori

## Projects

| Project | Platform | DSN | Purpose |
|---------|----------|-----|---------|
| `stori-web` | JavaScript (Browser) | `https://f3ef7a7848b601280ea702f96385a727@o4511399706034176.ingest.us.sentry.io/4511399851261952` | Browser errors from production web app |
| `stori-cloudrun` | Node.js | `https://e1b1eff5c04ff4389b8fb3919d3669dc@o4511399706034176.ingest.us.sentry.io/4511399723139072` | Server errors from Cloud Run Hono service |

## DSN handling

- DSNs are stored as **environment secrets** only (Cloud Run env vars, Vercel env vars).
- DSNs are **never** committed to source code.
- The public DSN (`stori-web`) is safe to embed in browser-side JavaScript.
- The server DSN (`stori-cloudrun`) is set via `SENTRY_DSN_CLOUDRUN` env var on Cloud Run.

## Smoke verification

### Browser
1. Open `infra/sentry/web-smoke/index.html` in a browser (update the DSN placeholder first).
2. Click "Throw Error".
3. Verify event appears in `stori-web` project in Sentry within 60s.
4. Screenshot the Sentry event and paste below.

**Screenshot:**
_(paste here at phase exit)_

### Cloud Run
```bash
curl -X POST https://<CLOUDRUN_URL>/v1/sentry-smoke
# → 500; event visible in stori-cloudrun project within 60s
```

**Screenshot:**
_(paste here at phase exit)_

## Pricing

- Free tier: 5K events/month.
- If dogfood traffic exceeds this, upgrade to Team plan ($26/mo for 50K events) before Phase 08.
