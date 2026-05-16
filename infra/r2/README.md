# R2 Bucket — Stori

## Bucket details

| Field | Value |
|-------|-------|
| Bucket name | `stori-dev` (promote to `stori-prod` later) |
| Region | auto (Cloudflare-managed) |
| Endpoint | `https://8d0c55d4c79fb24326ba6ad5edd8b6b0.r2.cloudflarestorage.com` |
| Custom domain | `r2.kaatchiai.com` (to be configured in Phase 03) |

## Smoke test

```bash
node scripts/smoke-r2.mjs
# Expected: "PUT ok ... GET ok ... bytes match ✓"
```

## Lifecycle rules

None attached yet. R2 lifecycle policies (cold storage, retention, public-vs-signed reads) will be decided in ADR-07 and attached in Phase 03.

## Pricing confirmation

- **R2 zero-egress claim:** confirmed on Cloudflare pricing page at <https://developers.cloudflare.com/r2/pricing/> — zero egress fees, $0.015/GB/month storage, Class A ops $4.50/million, Class B ops $0.36/million.
- **Date confirmed:** _fill in at phase exit_
