# Cost Optimization Analysis — ShopFlow Infrastructure

**Date:** 2026-07-02 · **Scope:** the `infrastructure/` Terraform stack at its
current defaults (2 AZ, single NAT, 1× t3.small node, ALB HTTP-only, CloudFront
PriceClass_100) · **Assignment:** Domain 4, Entry 22

> **Method note.** The intended tool, [infracost](https://www.infracost.io/),
> requires a (free) API key for its pricing service; none is configured in this
> environment, so it was **not run**. Figures below are hand-computed from
> published us-east-1 on-demand prices at the time of writing and **must be
> verified against the AWS pricing pages (and re-generated with infracost)
> before budgeting decisions**. Command for when a key exists:
>
> ```bash
> docker run --rm -e INFRACOST_API_KEY \
>   -v "$PWD/infrastructure":/code infracost/infracost:ci-latest \
>   breakdown --path /code --show-skipped
> ```

## 1. Monthly cost at current defaults (~us-east-1, 730 hrs)

| Resource | Unit price | Est. $/mo |
|---|---|---|
| EKS control plane | $0.10/hr | **73.00** |
| NAT gateway (1×, shared) | $0.045/hr | **32.85** |
| NAT data processing | $0.045/GB | traffic-dependent |
| Public IPv4 addresses (NAT EIP 1 + ALB ~2) | $0.005/hr each | ~10.95 |
| EC2 node, 1× t3.small on-demand | $0.0208/hr | 15.18 |
| EBS gp3 node volume (20 GB) | $0.08/GB-mo | 1.60 |
| ALB | $0.0225/hr + LCU | 16.43+ |
| KMS CMK (EKS secrets) | $1/key-mo | 1.00 |
| CloudWatch Logs — 5 control-plane log types | $0.50/GB ingested | ~2–10 |
| CloudFront + S3 origin (low traffic) | always-free tier / 5 GB | ~0 |
| **Total (idle, before data transfer)** | | **≈ $153–165** |

Two line items are structural and immune to sizing: the **EKS control plane
($73)** and the **NAT gateway ($33 + data)**. Everything else together is
smaller than either of them.

## 2. Optimizations already applied (this repo's history)

| Change | Saving vs. naive baseline |
|---|---|
| `single_nat_gateway = true` (vs one per AZ) | −$32.85/mo per extra AZ |
| `az_count` 3 → 2 | −1 subnet set; enables the NAT saving above |
| Node `t3.large` → `t3.small`, group 2–4 → 1–2 | −$45.55/mo (was $60.74 for 2× t3.large) |
| k8s replicas 3/2 → 1/1, HPA 3–10 → 1–3, requests halved | fits the 1-node group; no second node forced |
| ALB HTTP-only listener by default | no ACM/HTTPS ops overhead (LCU unchanged) |
| CloudFront `PriceClass_100` | cheapest edge class |
| CPU-only torch pin (backend image) | ~5 GB smaller image → faster pulls, smaller cache; avoids GPU-node temptation |
| S3 lifecycle on the CDN origin (this entry) | caps noncurrent-version growth — versioning without expiry is unbounded storage |

## 3. Available levers, largest first

| Lever | Est. impact | Effort / caveat |
|---|---|---|
| **Don't run EKS at all** → docker compose on one free-tier EC2 micro (see `docs/aws-free-tier.md`) | −everything (≈ $0) | Already documented; the right call for this project's demo phase |
| `node_capacity_type = "SPOT"` (variable already exists) | −~70% on nodes (15.18 → ~4.60) | Interruption-tolerant workloads only; fine for stateless app pods |
| Graviton `t4g.small` nodes | −~19% on nodes | Needs arm64/multi-arch images in CI |
| Trim `enabled_cluster_log_types` to `["api","audit","authenticator"]` | −most of the CW ingest (controllerManager/scheduler are the chatty ones) | Keep audit for security; verify against compliance needs |
| VPC **gateway endpoint for S3** (free) | −NAT data charges for S3 traffic (image pulls via ECR→S3) | 10 lines of Terraform in `networking` |
| VPC **interface endpoints** for ECR/STS/CW | −NAT data, +$7.30/endpoint-mo | Only pays off at real traffic volumes |
| fck-nat / NAT instance (t4g.nano) instead of NAT gateway | 32.85 → ~$3.50 | Community AMI, self-managed, lower throughput — dev only |
| Scheduled scale-to-zero of the node group outside demo hours | −~50–70% of node cost | EventBridge + a tiny Lambda or `eks update-nodegroup-config` cron |
| Turn off the stack when idle (`terraform destroy` between demos) | −100% while down | State backend must be remote first; ~20 min to recreate |

## 4. Cheaper architectures for the same app (if EKS isn't the point)

| Option | Est. $/mo | Trade-off |
|---|---|---|
| Docker compose on free-tier EC2 (Path A, `docs/aws-free-tier.md`) | ~0 (first 12 mo) | Single box, no orchestration — **current recommendation** |
| ECS on the same EC2 (EC2 launch type) | ~0 extra | Gets you task defs/rolling deploys without a control-plane fee |
| Lightsail container service (nano×1) | ~7 | Simplest managed option, limited knobs |
| App Runner (0.25 vCPU idle-scaled) | ~5–15 | Backend only; scale-to-zero-ish pricing |
| EKS (this stack, minimum) | ~153–165 | The portfolio IaC artifact — validate, don't apply |

## 5. Decision for this project

Free tier only → **Path A (compose on EC2) for anything actually running**;
the EKS stack remains a validated, reviewed portfolio artifact. If it is ever
applied for a time-boxed demo: SPOT nodes, trimmed log types, S3 gateway
endpoint, and `terraform destroy` when done — that demo-day profile is roughly
**$5–6/day**.

*Prices as of 2026-07; verify before use. Re-run with infracost once an API key
is available and commit the JSON alongside this doc.*
