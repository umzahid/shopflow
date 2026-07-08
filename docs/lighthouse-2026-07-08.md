# Lighthouse Mobile Audit — 2026-07-08 (PRD §2.5 deliverable)

**Target:** ≥ 85 on Performance, Accessibility, Best Practices, SEO (mobile) for home + product listing.
**Setup:** production build (`next build` + `next start`), real backend + seeded Postgres via docker compose, Lighthouse 13.x default mobile emulation (Moto G Power, slow-4G simulated throttling), headless Chrome.
**Full reports:** [`docs/lighthouse/home-2026-07-08.html`](lighthouse/home-2026-07-08.html) · [`docs/lighthouse/products-2026-07-08.html`](lighthouse/products-2026-07-08.html)

## Results — all ≥ 85 ✅

| Page | Performance | Accessibility | Best Practices | SEO | LCP | FCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` (home) | **91** | **100** | **96** | **100** | 3.5 s | 0.8 s | 0 | 0 ms |
| `/products` (listing) | **93** | **98** | **96** | **100** | 3.2 s | 0.8 s | 0 | 0 ms |

## Bug found and fixed during the audit

The first home run scored **75** (LCP 8.4 s, page weight 1,560 KiB). Root cause was a real production bug, not a page-design issue:

**`sharp` was missing from dependencies.** In Next.js `output: standalone` production mode, the image optimizer requires `sharp`; without it, `/_next/image` logs `'sharp' is required to be installed in standalone mode` and serves every remote image **at original size, un-resized** — the hero photo transferred 663 KB regardless of the requested `w`/`q` params. This affected the Docker image too (same standalone mode), so all product/hero images in any deployed environment were unoptimized.

**Fix (commit this change set):**
1. Added `sharp` to `frontend/package.json` dependencies — optimizer now resizes correctly (hero: 663 KB → 30 KB at w=640).
2. Dropped `quality={90}` on the hero `<Image>` (default 75) — the photo sits behind a dark gradient scrim, so the extra quality was invisible.

After the fix: home LCP 8.4 s → 3.5 s, total page weight 1,560 → 447 KiB, performance 75 → 91.

## Repro

```bash
docker compose up -d                       # backend + db + redis
cd frontend && npm run build && npm start  # production frontend
npx lighthouse http://localhost:3000 --output=html --chrome-flags="--headless=new"
npx lighthouse http://localhost:3000/products --output=html --chrome-flags="--headless=new"
```

Scores are simulated slow-4G mobile; local hardware differences shift Performance by a few points. LCP on both pages is the first product/hero image — already `priority`-loaded; remaining LCP time is the simulated network cost of the (now correctly sized) image.
