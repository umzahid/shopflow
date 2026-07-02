# Terraform VPC + EKS Foundation — Design Spec

**Date:** 2026-07-02
**Assignment task:** Domain 4 — Entry 18 (Terraform VPC + EKS modules)
**Status:** DRAFT — pending approval before implementation plan

## Purpose

The AWS infrastructure foundation for ShopFlow, authored as reusable Terraform
modules: a **networking** module (VPC + multi-AZ subnets + NAT/IGW + routing) and
a **compute** module (EKS cluster + managed node group + IRSA/OIDC), wired
together by a root composition. This is the base every other Domain 4 deliverable
builds on (CloudFront E20, k8s manifests E21, Well-Architected review E19,
infracost E22).

**This is validated IaC, not provisioned infrastructure.** No `terraform apply`,
no real AWS account, no credentials. Verification is offline: `terraform fmt
-check` + `terraform init -backend=false` + `terraform validate`, run in a
`hashicorp/terraform` Docker container (no local install). Secrets/account-specific
values are variables with a committed `terraform.tfvars.example` — **never real
values** (ISMS: no live credentials or account IDs in the repo).

## Decisions (proposed — confirm before plan)

- **Hand-authored modules, not community registry modules.** The task is to
  demonstrate authoring Terraform modules; `modules/networking` and
  `modules/compute` are written from scratch to match the existing scaffold. (The
  E19 Well-Architected review will note that production teams often prefer
  battle-tested `terraform-aws-modules/*` — a deliberate, documented trade-off.)
- **Uses the existing skeleton** `infrastructure/modules/{networking,compute}`
  (empty dirs already present). `cdn`, `database`, `storage`, `monitoring` stay
  empty this session (later Domain 4 entries).
- **EKS with a managed node group in private subnets.** Nodes are never in public
  subnets. Cluster endpoint public access is a variable (`public_access_cidrs`,
  default `["0.0.0.0/0"]` with a loud note to restrict in prod).
- **Security posture baked in** (ISO 27001 context, and it front-loads the E19
  review): EKS secrets envelope-encryption via a dedicated KMS key; control-plane
  logging (`api,audit,authenticator,controllerManager,scheduler`); IRSA OIDC
  provider so workloads use scoped IAM roles instead of node credentials; least
  the AWS-managed EKS policies (no wildcards we author ourselves).
- **Pinned versions.** `terraform >= 1.5`, `hashicorp/aws ~> 5.60`,
  `hashicorp/tls ~> 4.0` (for the OIDC thumbprint). No provider floats.
- **Local backend by default.** A remote S3+DynamoDB backend is provided as a
  commented `backend.tf.example` (so offline `validate` never needs a real
  bucket). `init -backend=false` is the verification path.

## Architecture & components

```
infrastructure/
  versions.tf              terraform + provider version pins
  variables.tf             region, project, env, vpc_cidr, az_count,
                           cluster_version, node sizing, public_access_cidrs, tags
  main.tf                  provider "aws" (default_tags); module "networking";
                           module "compute" (consumes networking outputs)
  outputs.tf               vpc_id, subnet ids, cluster name/endpoint/CA,
                           oidc_provider_arn, node_group_name
  terraform.tfvars.example example non-secret values
  backend.tf.example       commented S3 + DynamoDB remote backend
  modules/
    networking/
      main.tf              aws_vpc, aws_internet_gateway,
                           public+private subnets (per AZ via cidrsubnet),
                           aws_eip + aws_nat_gateway, route tables + associations
      variables.tf         name, vpc_cidr, az_count, single_nat_gateway, tags
      outputs.tf           vpc_id, vpc_cidr_block, public_subnet_ids,
                           private_subnet_ids, nat_gateway_ids
    compute/
      main.tf              KMS key (secrets encryption); cluster IAM role +
                           AmazonEKSClusterPolicy; aws_eks_cluster (private subnets,
                           encryption_config, enabled_cluster_log_types,
                           vpc_config endpoint access); tls_certificate +
                           aws_iam_openid_connect_provider (IRSA); node IAM role +
                           worker/CNI/ECR policies; aws_eks_node_group; core addons
                           (vpc-cni, coredns, kube-proxy)
      variables.tf         cluster_name, cluster_version, vpc_id, subnet_ids,
                           public_access_cidrs, node instance_types, desired/min/max,
                           capacity_type, tags
      outputs.tf           cluster_name, cluster_endpoint,
                           cluster_certificate_authority (sensitive),
                           cluster_security_group_id, oidc_provider_arn,
                           oidc_issuer_url, node_group_name
```

**Subnet tagging for EKS load balancers:** public subnets get
`kubernetes.io/role/elb = 1`, private subnets `kubernetes.io/role/internal-elb =
1`, so the AWS Load Balancer Controller (installed later with k8s manifests, E21)
can auto-discover them.

**Wiring:** root `main.tf` passes `module.networking.vpc_id` and
`module.networking.private_subnet_ids` into `module.compute`. The compute module
places the cluster and node group in the private subnets.

## Data flow / dependency graph

`aws_vpc` → subnets → {IGW+public routes, NAT+private routes}; `private_subnet_ids`
→ `aws_eks_cluster` (+ KMS key, cluster IAM role) → OIDC issuer →
`aws_iam_openid_connect_provider`; cluster + node IAM role → `aws_eks_node_group`
→ EKS addons. Terraform resolves this ordering from references (no explicit
`depends_on` except where AWS requires it, e.g. node group after cluster policies).

## Security & policy notes (ISMS-aware — draft, pending control-owner review)

- No hardcoded secrets, account IDs, or CIDRs tied to a real network — all via
  variables; `terraform.tfvars.example` uses placeholder/example values.
- KMS-encrypted EKS secrets, control-plane audit logging, private worker nodes,
  IRSA (workload identity) — these are **drafted controls, not verified as
  deployed**; they map to CIS EKS Benchmark items and will be cross-checked in the
  E19 Well-Architected review.
- `cluster_certificate_authority` output flagged `sensitive`.
- `public_access_cidrs` default is permissive for validate convenience — the
  variable description explicitly says to restrict it before any real apply.

## Testing / verification (offline, no cloud, no creds)

Run in Docker (no local Terraform install):

1. `terraform fmt -check -recursive` — canonical formatting.
2. `terraform init -backend=false` — install pinned providers + local modules
   (network egress to the registry only; no AWS calls, no backend).
3. `terraform validate` — type/reference/schema correctness across root + both
   modules.

Optional (also Docker, if we want a security lint pass): `tflint` and `checkov`
against the modules — noted as a nice-to-have, not a gate for E18.

**No unit-test framework** — Terraform's own `validate` is the correctness gate.
`terraform plan`/`apply` are explicitly out of scope (need a real account).

## Scope

**In:** networking module (VPC, 3-AZ public+private subnets, IGW, NAT, routing,
EKS subnet tags), compute module (EKS cluster, managed node group, KMS secrets
encryption, control-plane logging, IRSA OIDC, core addons), root composition,
version pins, `.tfvars.example`, commented remote-backend example; offline
fmt+validate verification via Docker.

**Out (later Domain 4 entries / future):**
- CloudFront (`modules/cdn`) — E20.
- Kubernetes manifests + AWS Load Balancer Controller — E21.
- Well-Architected review write-up — E19.
- infracost cost analysis — E22.
- RDS / ElastiCache (`modules/database`), S3 (`modules/storage`), CloudWatch
  (`modules/monitoring`).
- Actual `terraform apply` / a real remote backend / CI `plan` automation.

## Follow-up after implementation

- Fill `PROMPT_LOG.md` Entry 18.
- Update memory (`shopflow_project.md` — Domain 4 foundation started;
  `shopflow_conventions.md` — Terraform validate-in-Docker convention, no-secrets
  rule).
- Verify with the exact Docker fmt/validate commands before committing.
