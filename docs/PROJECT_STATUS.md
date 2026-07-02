# ShopFlow — Project Status Report

**Date:** 2026-07-02 · **Branch:** `week-3-task` at `68a878a` (49 commits ahead of origin, **unpushed**)
**Assignment:** 8-week GenAI upskilling · **Graded artifact:** `PROMPT_LOG.md` — **30 / 36 entries filled**

---

## Executive summary

| Domain | Entries | Status |
|---|---|---|
| 1 — Backend Engineering | E1–E6 | ✅ **Complete** |
| 2 — Frontend Engineering | E7–E12 | ✅ **Complete** |
| 3 — DevOps & CI/CD | E13–E17 | ✅ **Complete** |
| 4 — Cloud & Infrastructure | E18–E22 | ✅ **Complete** (2026-07-02) |
| 5 — ML / AI Features | E23–E28 | ✅ **Complete** |
| 6 — Quality Engineering | E29–E34 | ⬜ **Remaining** — the only open domain |

**Overall: 5 of 6 domains done (~85–90%).** The 6 unfilled PROMPT_LOG entries
are exactly the Domain-6 stubs — no hidden logging debt elsewhere (an earlier
"7 unlogged entries" concern was a counting-script false alarm; those entries
were filled all along).

---

## Completed — what exists and how it was verified

### Domain 1 — Backend (FastAPI, async SQLAlchemy, Postgres, Redis)
- Auth (JWT 15-min access + rotating opaque refresh cookies), products, cart,
  orders/checkout, reviews, merchant/admin dashboards, coupons.
- Conventions enforced throughout: RFC 7807 problem details, soft deletes,
  UUID PKs, cursor pagination, bcrypt pinned 4.0.1.
- **Verified:** 196 tests against a real Postgres, coverage 80.46% (gate 70%),
  flake8 clean; live smoke 20/20.

### Domain 2 — Frontend (Next.js 14 + TypeScript + Tailwind)
- Storefront (home/listing/detail/cart/checkout), component library,
  Storybook, trust-blue theme, a11y audit applied, RTL checkout tests, Vitest.
- **Verified:** Vitest + Next build green in CI; `/` serves 200 live.

### Domain 3 — DevOps & CI/CD
- 8-stage GitHub Actions pipeline (lint be/fe, pytest w/ coverage gate, Vitest,
  Next build, Docker builds, API smoke, Trivy scan) — **fully green** as of
  `c3eef92`; multi-stage Dockerfiles (CPU-only torch pin, `libgomp1`);
  Prometheus `/metrics` + Grafana dashboard; `scripts/smoke.sh`.

### Domain 4 — Cloud & Infrastructure (completed today)
| Entry | Deliverable | Verification |
|---|---|---|
| E18 | Terraform `networking` (VPC, 2-AZ subnets, NAT, EKS tags) + `compute` (EKS, KMS secrets, IRSA/OIDC, node group, addons) + root | `terraform fmt`/`validate` Success (offline, Docker); adversarial review → 5 hardening fixes |
| E19 | `docs/well-architected-review.md` — 6 pillars vs actual code, 8-item action list | claims cited to file:resource; framed drafted-not-deployed |
| E20 | `cdn` module — CloudFront over private S3 origin, OAC, security headers, conditional TLS | validate Success; review → aliases-without-cert precondition guard |
| E21 | `k8s/` kustomize base (13 resources): workloads, HPA, IRSA SA, ALB Ingress, default-deny NetworkPolicy | kubeconform `-strict` Valid:13; review → probe-path/UID/netpol fixes |
| E22 | `docs/cost-optimization.md` + applied S3 lifecycle rule | infracost **not run** (needs API key — documented); hand-computed ≈$153–165/mo |

**Free-tier posture (owner constraint: free tiers only):** EKS is never free —
the stack stays a *validated, never-applied* portfolio artifact. `docs/aws-free-tier.md`
documents the **$0 path** (one free-tier EC2 micro + docker compose + swapfile).
Terraform/k8s defaults downsized accordingly (2 AZ, t3.small, 1-node, replicas 1,
HTTP-only ALB).

### Domain 5 — ML / AI (all six features, each behind a swap-hook + fake toggle so CI never needs network/models)
| Entry | Feature |
|---|---|
| E23 | Synthetic sales seeder + Prophet demand forecasting + restock alerts |
| E24 | pgvector semantic search (MiniLM-L6-v2, 384-d, lexical/semantic/hybrid modes, HNSW) |
| E25 | LightGBM checkout fraud scoring + native TreeSHAP reasons; heuristic fallback |
| E26 | Merchant Copilot — agentic tool-calling loop on `claude-opus-4-8`, 6 read-only merchant-scoped tools, isolation proven by two-merchant tests |
| E27 | AI product descriptions — stateless endpoint, structured outputs via `extra_body`, 3 variants |
| E28 | Evaluation harness — `app/eval/` (hand-rolled NDCG/recall/confusion-matrix/ROC-AUC, 99% covered) + search & fraud eval CLIs |

### Cross-cutting quality work (this session)
- **Live endpoint sweep — all green:** auth lifecycle, products CRUD + role
  guards, 3 search modes (real encoder), cart, checkout **with live fraud
  scoring**, orders, reviews gating, merchant analytics, health/metrics/docs,
  frontend, Grafana.
- **Bugs found & fixed along the way:** missing `ANTHROPIC_API_KEY` → raw 500
  (now RFC 7807 503); frontend k8s probes pointed at a nonexistent route (would
  CrashLoop); UID mismatch vs image; NetworkPolicy allowed all namespaces;
  eval CLI crashed on read-only container FS; CDN aliases-without-cert would
  fail apply; unbounded S3 version growth.

---

## Remaining work

### Domain 6 — Quality Engineering (the only open domain)

| Entry | Task | Reality check |
|---|---|---|
| **E29** | Backend unit test suite | **Suite already exists** (196 tests, 80% cov) — only the log entry needs writing. Quickest win. |
| **E30** | Playwright E2E scripts | Not built. Stack runs locally; natural next build item. |
| **E31** | k6 performance test scripts | Not built. Target the API against compose. |
| **E32** | OWASP ZAP findings analysis | Not built. ZAP baseline scan vs `localhost:8000/3000` + write-up. |
| **E33** | Test Plan document | Not built. Should synthesize E29–E32. |
| **E34** | Bug report writing | Not built. Rich material exists — this session alone produced 7+ real, fixed bugs to write up. |

Suggested order: **E29 (log only) → E30 → E31 → E32 → E34 → E33** (plan last,
so it documents what actually exists).

### Items needing Umair (5 minutes)
- **7 entries carry placeholders**: E18–E22, E27, E28 — confirm the
  _verbatim prompt_ wording and add your **Output Quality (1–5)** rating.
- **Push the branch** — 49 commits ahead of `origin/week-3-task`, all local.
  (One `git push` — everything is committed and the tree is clean.)

### Optional / stretch (not required by the log)
- Week 5 Track B (S3 image uploads) — deferred by choice.
- E19 action list top items if the infra is ever applied: EKS access entries,
  per-AZ NAT, `public_access_cidrs` restriction.
- CI jobs for terraform fmt/validate + kubeconform (cheap; commands exist).
- Re-run E22 with a real infracost API key and commit the JSON.
- GitHub Actions polish pass.

---

## Key repo pointers

| What | Where |
|---|---|
| Graded log | `PROMPT_LOG.md` (30/36 filled) |
| Specs & plans (superpowers pipeline) | `docs/superpowers/{specs,plans}/` |
| WA review / cost / free-tier docs | `docs/well-architected-review.md`, `docs/cost-optimization.md`, `docs/aws-free-tier.md` |
| IaC | `infrastructure/` (validate-only) · `k8s/` (kubeconform-validated) |
| Eval harness | `backend/app/eval/` + `app/scripts/eval_{search,fraud}.py` |
| Verification commands | CLAUDE.md + each doc's header |

*Report generated 2026-07-02 against commit `68a878a`. Regenerate after Domain 6 lands.*
