# Frontend Bundle Baseline — 2026-07-08

**Command:** `npm run build` (Next.js 14.2.35, production) · **Branch:** `feat/frontend-prd-tail`
**Purpose:** committed baseline before any further perf work (per stack-audit-2026-07-08 recommendation).

## Route table (First Load JS)

| Route | Route size | First Load JS |
|---|---:|---:|
| `/` (home) | 5.39 kB | **141 kB** |
| `/products` (listing) | 4.87 kB | **141 kB** |
| `/products/[id]` | 6.73 kB | 139 kB |
| `/cart` | 3.41 kB | 130 kB |
| `/checkout` | 4.34 kB | 153 kB |
| `/account` | 6.93 kB | 139 kB |
| `/orders/[id]` | 4.79 kB | 137 kB |
| `/login` · `/register` | ~1.4 kB | 141 kB |
| `/merchant` | 5.82 kB | 123 kB |
| `/merchant/products` | 10.6 kB | 119 kB |
| `/merchant/orders` | 8.95 kB | 118 kB |
| `/merchant/analytics` | 5.83 kB | 115 kB |
| `/landing` | 57.7 kB | 164 kB |
| **Shared by all** | — | **87.6 kB** |

## Findings

1. **framer-motion is fully route-isolated.** The animated landing page carries a 57.7 kB route chunk (164 kB first load); no other route pays for it — home/listing stay at 141 kB. The commit-it decision (0fd751c) has no storefront cost.
2. **Customer-critical routes are all ≤ 153 kB first load** — comfortably in the range where Lighthouse mobile ≥ 85 is achievable; JS payload is unlikely to be the blocker.
3. **Merchant routes are the lightest (115–123 kB)** thanks to the existing `next/dynamic` splits (Copilot panel, ForecastChart).
4. Shared baseline is 87.6 kB (React 18 + Next runtime + React Query) — normal for this stack; no action.

**Verdict:** no bundle-driven optimization warranted right now. Re-run after any new heavy dependency; pair with the Lighthouse run for the §2.5 deliverable.
