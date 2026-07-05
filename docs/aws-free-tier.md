# Running ShopFlow on AWS Free Tier

> Cost figures are ballpark us-east-1 on-demand prices at the time of writing.
> **Verify against the AWS pricing pages and the Free Tier terms before relying
> on them** — free-tier allowances differ for accounts created after 2024-07
> (credit-based plans) vs older 12-month plans.

## TL;DR

| Path | Monthly cost | Use it for |
|---|---|---|
| **A. Single EC2 + docker compose** | **~$0** (within free tier) | Demos, the upskilling review, personal use |
| B. The Terraform EKS stack (`infrastructure/`) | ~$110+ even at minimum size | Portfolio IaC artifact — validate, don't apply |

**EKS is never free.** The control plane bills ~$0.10/hr (~$73/mo) and a NAT
gateway ~$0.045/hr (~$32/mo) — neither has a free-tier allowance. The Terraform
stack in this repo is deliberately kept as *validated infrastructure code* for
the assignment; do not `apply` it on a free-tier-only account.

## Path A — the $0 deployment (recommended)

Everything runs on **one free-tier EC2 instance** with the existing
`docker-compose.yml` (same as local dev).

What the free tier gives you (12-month plans; check yours):

- **EC2**: 750 hrs/mo of `t2.micro`/`t3.micro` — one instance running 24/7.
- **EBS**: 30 GB gp3.
- **Data transfer**: 100 GB/mo egress.
- (Optional) **CloudFront**: 1 TB/mo egress — in the always-free tier.

### Caveat: memory

A micro instance has **1 GB RAM**. The full compose stack (Postgres + Redis +
backend + frontend + Prometheus + Grafana) doesn't fit. Two options:

1. **Drop the observability containers** (Prometheus/Grafana) on the instance:
   `docker compose up -d postgres redis backend frontend` — fits in ~800 MB if
   you add a swapfile (below).
2. If your account's free plan covers a bigger instance (credit-based plans
   effectively do), use `t3.small` (2 GB) and run everything.

### Steps

```bash
# 1. Launch: t3.micro (or t2.micro), Amazon Linux 2023 or Ubuntu 24.04,
#    30GB gp3, a security group allowing 22 (your IP), 80/3000/8000 as needed.

# 2. Swap (critical on 1GB — the backend's torch/ML imports are memory-hungry):
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. Docker + compose plugin, then clone and configure:
git clone <repo> shopflow && cd shopflow
cp env.example .env         # fill values; NEVER commit .env
# In .env: set COOKIE_SECURE=True only if you terminate TLS; set strong
# POSTGRES_PASSWORD/JWT_SECRET_KEY; leave ANTHROPIC_API_KEY empty if unused —
# the AI endpoints then return a clean 503 (fix dcebff0), everything else works.

# 4. Core stack only (fits micro):
docker compose up -d postgres redis backend frontend
```

Notes:

- The backend image includes CPU-only torch (the `+cpu` pin) — no GPU needed,
  but first semantic-search call downloads the ~90 MB MiniLM model; with 1 GB
  RAM keep the swapfile.
- To skip the model entirely set `SHOPFLOW_FAKE_EMBEDDINGS=1` (deterministic
  fake vectors — search works but relevance is meaningless).
- Fraud scoring falls back to the built-in heuristic when no trained artifact
  is present (a warning is logged; checkout works).
- Don't run the `week-3-task` CI, Trivy, or eval harness on the instance — run
  those locally/CI.

### Optional free add-ons

- **CloudFront in front of the instance** (always-free 1 TB/mo): create a
  distribution with the EC2 public DNS as a custom origin — free TLS at the
  edge without an ALB.
- **S3 (5 GB)** for product images when Week-5 Track B lands.

## Path B — what the Terraform stack costs (do NOT apply on free tier)

Minimum-size estimate with the current defaults (2 AZ, 1× t3.small node,
single NAT, ALB, HTTP-only):

| Component | ~$/mo |
|---|---|
| EKS control plane | 73 |
| NAT gateway (+ data) | 32+ |
| 1× t3.small node | 15 |
| ALB | 16 (750 hrs may be free-tier-covered the first year) |
| EBS/misc | ~3 |
| **Total** | **~$125–140** |

The defaults were deliberately downsized (commit history: `az_count=2`,
`t3.small`, 1-node group, k8s replicas=1, HTTP-only ALB) so an intentional
non-free deployment is as cheap as EKS can be — but the floor is the control
plane + NAT, which no sizing can remove.

Cheaper managed-k8s-less alternatives if you outgrow Path A: ECS on the same
free EC2 instance ($0 extra), or App Runner / Lightsail ($7–12/mo). A proper
infracost analysis is planned as PROMPT_LOG Entry 22.
