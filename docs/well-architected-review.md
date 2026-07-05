# AWS Well-Architected Review — ShopFlow Infrastructure

**Date:** 2026-07-02 · **Scope:** `infrastructure/` (networking, compute, cdn Terraform modules + root) and `k8s/` (kustomize base) · **Assignment:** Domain 4, Entry 19

> **Status of every "in place" statement below: drafted in code, validated
> offline (`terraform validate` / `kubeconform`), never applied to a real AWS
> account.** Nothing here has been verified against running infrastructure.
> Pillar definitions follow the AWS Well-Architected Framework (six pillars);
> recommendations should be re-checked against the official framework docs and
> the EKS Best Practices Guide before being relied on.

Severity: **[H]** fix before any real workload · **[M]** fix soon after ·
**[L]** improvement / accepted trade-off.

---

## 1. Security

**What the code does well**

| Control (drafted) | Where |
|---|---|
| EKS secrets envelope encryption, dedicated KMS key, rotation on, 30-day deletion window | `compute/main.tf` (`aws_kms_key.eks`) |
| All five control-plane log types (`api, audit, authenticator, controllerManager, scheduler`) | `compute/main.tf:58` |
| IRSA (OIDC provider, root-CA thumbprint) — workload identity instead of node credentials | `compute/main.tf` + `k8s/serviceaccount.yaml` |
| Worker nodes and cluster ENIs in private subnets only | `compute` var `private_subnet_ids` |
| CloudFront origin: private S3 (4× public-access block), OAC + `AWS:SourceArn`-scoped bucket policy, SSE, versioning | `cdn/main.tf` |
| Security headers at the edge (HSTS/preload, nosniff, frame DENY, referrer, XSS) | `cdn/main.tf` response headers policy |
| Pods: non-root (image-matched UIDs), drop-ALL caps, no privilege escalation, RuntimeDefault seccomp, backend RO root fs | `k8s/backend.yaml`, `k8s/frontend.yaml` |
| Default-deny ingress NetworkPolicy; ALB allowed by VPC-CIDR ipBlock; egress restricted to DNS/5432/6379/443 | `k8s/networkpolicy.yaml` |
| No secrets in repo — tfvars gitignored, k8s Secret is an excluded placeholder example | `.gitignore`, `k8s/secret.example.yaml` |

**Findings**

- **[H] No EKS access entries / aws-auth provisioning.** After `apply`, only the
  cluster-creating IAM principal can reach the API. One lost credential = locked
  out; no break-glass admin, no read-only role for teammates. Add
  `aws_eks_access_entry` resources (deferred from the E18 review).
- **[M] API endpoint public by default** (`endpoint_public_access = true`,
  `public_access_cidrs = 0.0.0.0/0`). Documented as validate-convenience; a real
  deployment must flip the variable or restrict CIDRs. The knob exists — the
  default is the risk.
- **[M] No custom node security group.** The module relies entirely on the
  EKS-managed cluster SG (open egress). No node-level egress restriction to
  match the k8s-layer NetworkPolicy (defense in depth) — deferred from E18.
- **[M] No WAF by default.** `cdn_web_acl_id` and ALB WAF association are opt-in
  and null. Fine for a demo; not for anything internet-facing with auth.
- **[M] No ECR image-scanning / provenance story.** Manifests reference ECR
  placeholders; nothing defines scan-on-push, tag immutability, or admission
  checks.
- **[L] CDN origin bucket policy lacks an `aws:SecureTransport` deny** —
  CloudFront→S3 is TLS anyway; belt-and-braces only.
- **[L] KMS key uses the default key policy** (account root full access). A
  scoped policy naming cluster/admin roles is stricter.

## 2. Reliability

- **[H] Single NAT gateway is an availability SPOF** (`single_nat_gateway =
  true`): if its AZ fails, all private-subnet egress fails cluster-wide. This is
  a *documented cost trade-off* (E22) — the per-AZ toggle exists; flip it for
  production.
- **[M] Node group min = desired = 1** (free-tier sizing): a node failure is a
  full app outage until replacement. Production floor: 2 nodes across AZs.
- **[M] No PodDisruptionBudgets and no `topologySpreadConstraints`** — with >1
  replica, both pods can land on one node/AZ, and a drain can evict everything
  at once.
- **[M] No cluster autoscaler / Karpenter.** The HPA (1–3) can scale pods it
  has no nodes for; nothing scales nodes. Also HPA requires metrics-server
  (documented prerequisite, not installed by this code).
- **[L] Addon versions unpinned** (`aws_eks_addon` without `addon_version`):
  non-deterministic addon versions across applies. `resolve_conflicts_on_create
  = OVERWRITE` is set; add pins for repeatability.
- **[L] No state/locking in use** — `backend.tf.example` (S3 + DynamoDB) exists
  but is inert; local state can't be shared or recovered. Activate before any
  team use.

## 3. Operational Excellence

- **Good:** everything is code; offline verification gates exist and are exact,
  repeatable Docker commands (terraform fmt/validate, kustomize+kubeconform);
  provider `default_tags` stamp Project/Environment/ManagedBy on every resource;
  decisions and prompts are audit-trailed in `PROMPT_LOG.md` and
  `docs/superpowers/`.
- **[M] No CI integration for the IaC** — the repo's 8-stage pipeline covers
  app code; terraform fmt/validate and kubeconform are run manually. Adding
  them as CI jobs is cheap (same Docker commands).
- **[L] No tflint/checkov/trivy-config lint pass** (noted optional in the E18
  spec). Would have caught some review findings mechanically.
- **[L] No runbooks** (deploy, rollback, key rotation, lockout recovery).

## 4. Performance Efficiency

- **[M] Burstable `t3.small` nodes with ML workloads.** The backend loads
  MiniLM (~90 MB) and LightGBM; sustained inference on burstable instances
  throttles when CPU credits run out. Acceptable for demo/free-tier; move ML
  paths to fake toggles or bigger/Graviton nodes under load.
- **[L] HPA scales on CPU only** — the backend is memory-heavy (torch);
  a memory target or custom metrics (request latency via Prometheus adapter)
  would track real saturation better.
- **Good:** CloudFront uses `Managed-CachingOptimized` + compression; gp3 EBS
  by default; ALB `target-type: ip` avoids a second hop.

## 5. Cost Optimization

Covered in depth in `docs/cost-optimization.md` (Entry 22) and
`docs/aws-free-tier.md`. Headlines: the EKS control plane (~$73/mo) and NAT
(~$33/mo) dominate and cannot be tuned away; defaults are already minimized
(2 AZ, single NAT, t3.small ×1, PriceClass_100, HTTP-only ALB); the `SPOT`
capacity lever exists but is unused; **the CDN origin bucket has versioning
without a lifecycle rule — noncurrent versions accumulate forever (unbounded
storage growth)** [M].

## 6. Sustainability

- **[L]** Graviton (`t4g`) nodes cut both cost (~19%) and energy per unit of
  work — requires arm64 images (multi-arch build not yet in CI).
- Minimal footprint is already the design: fewest AZs/nodes that function,
  PriceClass_100 limits edge replication, burstable instances match the idle
  profile of a demo workload.

---

## Prioritized action list

| # | Sev | Action | Pillar |
|---|---|---|---|
| 1 | H | Add `aws_eks_access_entry` (admin + read-only) so cluster access survives the creator | Security |
| 2 | H | Document/flip `single_nat_gateway=false` + node min≥2 for any production apply | Reliability |
| 3 | M | S3 lifecycle rule on the CDN origin (expire noncurrent versions, e.g. 30d) | Cost |
| 4 | M | Restrict `public_access_cidrs` / set `endpoint_public_access=false` in any real tfvars | Security |
| 5 | M | Add terraform fmt/validate + kubeconform jobs to CI | Ops |
| 6 | M | PDB + topologySpreadConstraints once replicas>1; install metrics-server + autoscaler | Reliability |
| 7 | M | Custom node SG with restricted egress; ECR scan-on-push | Security |
| 8 | L | Pin `addon_version`s; activate the S3 backend; tflint/checkov pass; Graviton migration | Various |

*Review performed against the code at commit `eb0ae60`; re-run after material
infrastructure changes.*
