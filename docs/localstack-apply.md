# Terraform Apply via LocalStack — Results (PRD Domain-4 deliverable)

**Date:** 2026-07-09 · **Runner:** `infrastructure/localstack/run.sh` · **Cost:** $0
**PRD:** "terraform apply runs cleanly (can use LocalStack for simulation)" (20 pts)

## Result

`terraform apply` executed against LocalStack **community 3.8** for every module
the community edition can emulate — **28 resources created**:

| Module | Resources | Status |
|---|---|---|
| `networking` | VPC, 2 public + 2 private subnets, IGW, NAT gateway + EIP, 3 route tables + associations, **VPC flow logs** (log group + IAM role/policy + flow log) | ✅ applied cleanly (22) |
| `monitoring` | CloudWatch log group, billing metric alarm, SNS alerts topic | ✅ applied cleanly (3) |
| `storage` | S3 product-images bucket + ownership controls + public-access block + SSE + versioning | ✅ applied cleanly (5) |
| `storage` lifecycle config | IA@30d → Glacier@90d tiering | ⚠️ applied, provider verification false-negative (below) |
| `compute` (EKS), `database` (RDS + ElastiCache), `cdn` (CloudFront) | — | ⛔ LocalStack **Pro-only** APIs — remain validate-only (`terraform validate` clean), excluded via `-target` |

`terraform state list` after apply: 30 entries (28 managed resources + 2 data sources).

### The one ⚠️ — lifecycle configuration verification

The apply created the lifecycle configuration and LocalStack **provably stored it**
(verbatim from `awslocal s3api get-bucket-lifecycle-configuration`):

```json
"Transitions": [
  { "Days": 30, "StorageClass": "STANDARD_IA" },
  { "Days": 90, "StorageClass": "GLACIER" }
]
```

…but the AWS provider polls a post-create verification status that LocalStack 3.8
never surfaces, so the resource times out *after successful creation* ("timeout
while waiting for state to become 'true'"). Emulator gap, not a config error.
(`terraform import` can't adopt it either — import refreshes all data sources,
tripping the Pro-gated CloudFront lookups in the cdn module.)

## Repro

```bash
./infrastructure/localstack/run.sh
# tears down + restarts a pinned localstack/localstack:3.8, copies the provider
# override in, applies -target=module.{networking,storage,monitoring}, prints state.
# Cleanup: docker rm -f shopflow-localstack (state file is local + gitignored)
```

Provider override (`infrastructure/localstack/localstack_override.tf`) is copied in
only for the run and is gitignored at the root; normal validate/apply paths are
untouched. Endpoints ride on `AWS_ENDPOINT_URL` (hashicorp/aws ≥ 5.22).

## Field notes (real issues hit and fixed)

1. **macOS `--network host` loopback:** the AWS SDK dialed `[::1]:4566` inside
   Docker Desktop's host namespace where the published port isn't bound →
   connection refused. Fix: run terraform with `--network container:shopflow-localstack`
   so `localhost:4566` is LocalStack itself.
2. **`localstack/localstack:latest` now exits 55 demanding a license token.**
   Pinned to `3.8`, the verified token-free community release.
3. The lifecycle verification false-negative above.
