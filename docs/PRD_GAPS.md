# ShopFlow — PRD Gap Worklist

> **For Claude:** this is a self-contained, ordered worklist of every remaining gap
> between the repo and `~/projects/ShopFlow_GenAI_PRD.docx.txt` (480-pt spec).
> Work gaps **top to bottom, one at a time**: read the gap's Evidence, meet its
> Acceptance criteria, run its Verify command, check the box, commit with the
> suggested message prefix, then move to the next. Do not re-audit completed
> domains (see "Already done" below). Backend tests run **in the container**:
> `docker exec shopflow-backend-1 python -m pytest tests/ -q`. Frontend from
> `frontend/`: `npx vitest run` and `npm run build`.
>
> **State as of 2026-07-08** (branch `feat/frontend-prd-tail`, PR #4 green):
> backend 269 tests / 82%+ cov · frontend 100 tests · Lighthouse 91/93 committed.

## Already done — do NOT redo

- **Domain 1 (Backend): complete.** All 8 endpoint groups, auth, rate-limit tiers,
  RFC 7807, cursor pagination (+ price-sort variant), migrations 001-006, perf work.
- **Domain 2 (Frontend): complete.** Full storefront + merchant admin incl. weekly
  narrative, geo heat map, drawer timeline, table search/sort, listing sort dropdown,
  all 14 UI components + Storybook + tests, dark mode, Lighthouse ≥85 committed
  (`docs/lighthouse/`). Deviations documented in README (variant selector,
  bar-vs-line, 3-step checkout).
- **Domain 6 partial:** component tests done (100 FE tests); active ZAP (unauth)
  done; k6 PRD profiles done with root-cause docs; a11y on 5 pages done.
- **README deviations section** exists — extend it, don't recreate it.

---

## P1 — graded deliverables at risk

### GAP-01 · Run search eval, commit NDCG@3 result — Domain 5 (§5.2) ✅ DONE 2026-07-08
- [x] **What:** The PRD target "NDCG@3 ≥ 0.7" has never been demonstrated. The harness
  and golden set exist; no results file is committed.
- **Evidence:** `backend/app/scripts/eval_search.py`, `backend/app/eval/data/search_golden.json`;
  no committed results (grep "ndcg" hits only analysis docs).
- **How:** Run in the backend container with the REAL encoder (unset
  `SHOPFLOW_FAKE_EMBEDDINGS`): `docker exec shopflow-backend-1 python -m app.scripts.eval_search --k 3`.
  Needs seeded products with embeddings (`python -m app.scripts.backfill_embeddings` if empty).
  Save output to `docs/eval/search-ndcg-<date>.md` with the command, dataset size, and score.
  If score < 0.7, document honestly with analysis — do not tune the golden set to pass.
- **Accept:** committed results doc with an NDCG@3 number + repro command.
- **Verify:** `ls docs/eval/` shows the file; number present.
- **Commit:** `docs(eval): NDCG@3 search eval results`

### GAP-02 · Terraform apply via LocalStack — Domain 4 (20-pt deliverable) ✅ DONE 2026-07-09
- [x] **What:** "terraform apply runs cleanly (can use LocalStack)" — never exercised.
- **Evidence:** no localstack config anywhere; `infrastructure/` is validate-only.
- **How:** Add `infrastructure/environments/localstack.tfvars` + a provider override
  (endpoints → `http://localhost:4566`, `skip_credentials_validation`, etc. — standard
  LocalStack Terraform setup). Run LocalStack in docker, `terraform init && apply` with
  the override; expect partial resource support (EKS is Pro-only — document which
  resources applied vs. skipped honestly in `docs/localstack-apply.md`). Do NOT
  touch the real-AWS tfvars.
- **Accept:** apply output committed to `docs/localstack-apply.md` (what applied,
  what LocalStack free tier can't, exact commands).
- **Verify:** doc exists with a real `terraform apply` transcript excerpt.
- **Commit:** `feat(infra): LocalStack apply path + results (PRD Domain-4 deliverable)`

### GAP-03 · Rate the 13 PROMPT_LOG entries — Prompt Log (50 pts) — **OWNER TASK**
- [ ] **What:** 13 entries still say "(to rate)" — the rubric requires verbatim prompt
  confirmation + 1-5 quality ratings. **Claude must not self-rate these**; prompt the
  owner. Optionally add new entries for the post-log work (weekly narrative, geo map,
  sharp fix — a real found-bug story) to strengthen the log.
- **Verify:** `grep -c "to rate" PROMPT_LOG.md` → 0.

## P2 — explicit PRD requirements, cheap to close

### GAP-04 · Frontend server-side JSON logging — Domain 3 (§3.4) ✅ DONE 2026-07-09
- [x] **What:** PRD requires structured JSON logs from "backend and frontend
  (server-side)" with timestamp/level/service/traceId/message/durationMs. Backend done
  (`backend/app/core/logging.py`); frontend has nothing.
- **Evidence:** no `frontend/src/middleware.ts`; no JSON logger in frontend.
- **How:** Add Next.js `middleware.ts`: generate/propagate `x-trace-id`, log one JSON
  line per request to stdout with the 6 required fields (hand-rolled `JSON.stringify`,
  no pino dependency needed — match the backend's field names). Keep it edge-safe
  (no Node APIs).
- **Accept:** `curl localhost:3000` produces one JSON log line in
  `docker logs shopflow-frontend-1` with all 6 fields; existing tests/build green.
- **Verify:** `docker logs shopflow-frontend-1 --tail 5` after a request.
- **Commit:** `feat(obs): frontend server-side JSON request logging + traceId`

### GAP-05 · AI description button in product EDIT flow — Domain 5 (§5.6 task 27) ✅ DONE 2026-07-09
- [x] **What:** "one-click button in the merchant product editor" — exists in the
  CREATE form only; the inline row-edit has no description editing at all.
- **Evidence:** `frontend/src/app/merchant/products/page.tsx` — Generate button in
  `CreateProductForm` only.
- **How:** Add an "Edit details" drawer (or extend the row editor) with description
  textarea + the same Generate button pattern as create; PATCH via `useUpdateProduct`.
- **Accept:** a merchant can regenerate + save a description on an existing product;
  RTL test for the edit flow.
- **Verify:** `npx vitest run src/app/merchant/products` green; manual check.
- **Commit:** `feat(frontend): AI description generation in product edit flow`

### GAP-06 · E2E scenario 31's merchant leg — Domain 6 (§6.3) ✅ DONE 2026-07-09
- [x] **What:** "login as merchant → see review in dashboard" — the review lifecycle
  spec stops at the review appearing on the product page; nothing drives the merchant
  view. (Note: merchant admin has no reviews page — decide: smallest honest close is
  asserting the review is visible wherever merchants see reviews; if nowhere, add a
  recent-reviews widget to the merchant dashboard first, then the spec.)
- **Evidence:** `e2e/tests/reviews.spec.ts` (TC-22), `e2e/tests/merchant.spec.ts` (TC-23).
- **Accept:** one Playwright spec clicks through as merchant and asserts the review
  content is visible; suite green (`cd e2e && npx playwright test`).
- **Commit:** `test(e2e): scenario 31 merchant leg — review visible to merchant`

### GAP-07 · Make detect-secrets a CI gate — Domain 3/6 (§3.2 stage 4) ✅ DONE 2026-07-09
- [x] **What:** PRD: build fails if "any secret detected". Currently
  `continue-on-error: true` (report-only) in `.github/workflows/test.yml` (~line 362).
- **How:** Create a `.secrets.baseline` allowlisting the known test fixtures
  (`detect-secrets scan > .secrets.baseline`, audit it), switch the step to fail on
  NEW findings (`detect-secrets-hook` or scan + diff against baseline), remove
  `continue-on-error`.
- **Accept:** CI green on the PR with the gate active (prove it runs by the job log
  showing a non-skipped, non-soft-failed step).
- **Commit:** `ci(security): detect-secrets as a hard gate with audited baseline`

### GAP-08 · Terraform quick wins — Domain 4 (§4.2/§4.3) ✅ DONE 2026-07-11
- [x] 8a. **Route53 module** (10th component): hosted zone + A/ALIAS records for
  `app.` / `api.` (mock domain fine per PRD). ~50 lines; wire into root; `terraform validate`.
  *(app = ALIAS→CloudFront; api = A→TEST-NET-3 placeholder until the ingress ALB exists.)*
- [x] 8b. **HPA maxReplicas 3 → 10** (`k8s/backend.yaml:105`; PRD wants 2-10). Re-run
  kubeconform. *(minReplicas also 1→2 to match the PRD's 2-10 range.)*
- [x] 8c. **Wire the spot toggle**: `node_capacity_type` exists in
  `modules/compute/variables.tf` but is never passed from `main.tf` nor set in
  `environments/staging.tfvars` (set staging to SPOT).
- [x] 8d. **Activate remote state**: rename `backend.tf.example` → `backend.tf`
  behind a documented flag/comment (do NOT break local `terraform validate` — keep
  `-backend=false` in CI/docs if needed). *(LocalStack run.sh keeps working via a
  `backend "local" {}` override — init proven to select the local backend.)*
- [x] 8e. **CDN-module S3 lifecycle**: noncurrent versions currently expire at 30d;
  align with the storage module's IA@30d → Glacier@90d tiering. *(Tier IA@30 →
  Glacier@90, expire@365; current objects stay STANDARD — CloudFront can't serve Glacier.)*
- **Verify:** `terraform -chdir=infrastructure validate` clean (docker hashicorp/terraform
  image is the established runner); `kubeconform -strict k8s/`.
- **Commit:** `feat(infra): route53 module, HPA 2-10, spot staging, remote state, lifecycle alignment`

## P3 — polish and bonuses

### GAP-09 · ProductCard rating stars — Domain 2 fine print (§2.4) ✅ DONE 2026-07-11
- [x] **What:** PRD's ProductCard lists "rating stars"; the card renders a hardcoded
  "—"/"New listing" placeholder (no rating prop; list API carries no avg rating).
  *(Closed via option (a): `avg_rating` on the list response — one aggregate over the
  page's ids — + 5-star row on the card matching the detail-page idiom; unrated
  products keep the "New listing" placeholder.)*
- **How (choose one):** (a) add `avg_rating` to the product list response (subquery,
  same shape the detail page uses) and render stars; or (b) add one line to README
  deviations. Option (a) is a small BE+FE change; (b) is honest if time-boxed.
- **Commit:** `feat(products): avg rating on list + ProductCard stars` or `docs: deviation note`

### GAP-10 · a11y specs for detail/merchant/checkout pages — Domain 6 (§6.2)
- [ ] **What:** axe suite covers 5 pages (`e2e/tests/a11y.spec.ts`); product detail,
  merchant pages, and checkout are not scanned.
- **Accept:** axe specs for `/products/[id]`, `/merchant`, `/merchant/products`,
  `/merchant/orders`, `/merchant/analytics`, `/checkout` — 0 serious/critical.
- **Commit:** `test(a11y): axe coverage for detail, merchant, and checkout pages`

### GAP-11 · Authenticated ZAP scan — Domain 6 (§6.5)
- [ ] **What:** current ZAP scans are unauthenticated (`security/zap-scan.sh:29-30`);
  merchant/admin surface (IDOR, priv-esc, copilot isolation boundary) unscanned.
- **How:** extend `zap-scan.sh` with a session-token context (login via API, pass
  Bearer header); triage findings into `docs/zap-findings.md`.
- **Accept:** scan ran against `/merchant/*` + `/admin/*`; 0 High; findings triaged.
- **Commit:** `security(zap): authenticated scan of merchant/admin surface`

### GAP-12 · OpenTelemetry tracing — Domain 3 bonus (+10 pts)
- [ ] **What:** unclaimed bonus: OTel tracing exported to Jaeger or Grafana Tempo.
- **How:** backend `opentelemetry-instrumentation-fastapi` + OTLP exporter; Jaeger
  all-in-one in compose; propagate the existing traceId. Frontend optional.
- **Accept:** a request produces a visible trace in Jaeger UI; docs snippet with
  screenshot/instructions.
- **Commit:** `feat(obs): OpenTelemetry tracing → Jaeger (PRD +10 bonus)`

### GAP-13 · Scheduled CI runs for E2E/k6/ZAP — Domain 6 (optional hardening)
- [ ] Nightly `schedule:` workflow running Playwright suite + k6 smoke + ZAP baseline
  against a compose-up stack. Keep it non-blocking (separate workflow).
- **Commit:** `ci: nightly e2e + k6 + zap workflow`

### GAP-14 · Copilot response streaming — Domain 5 (optional)
- [ ] SSE streaming for `/merchant/copilot` + incremental rendering in the panel.
  Perceived-latency only; do this last.

## Owner-only (Claude: surface these, don't attempt)

- **GAP-15 · 5-minute demo video** — README/Demo deliverable (30 pts includes this).
- **GAP-16 · infracost run** — needs a free API key; README cost section is a
  placeholder (`README.md` "Cost Estimate"). Commit the JSON + a cost summary.
- **GAP-03** ratings (above).

---

*Generated 2026-07-08 after the Domain-2 close-out (PR #4). Sources: full six-domain
audit (`docs/stack-audit-2026-07-08.md`), FE fine-print sweep, and per-item
re-verification the same day. If this file and the repo disagree, trust the repo and
update this file.*
