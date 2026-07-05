# Terraform VPC + EKS Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Author a `networking` module (VPC + multi-AZ subnets + NAT/IGW + routing) and a `compute` module (EKS cluster + managed node group + KMS secrets encryption + IRSA/OIDC + core addons), wired by a root composition, all `terraform validate`-clean and `fmt`-clean — verified offline in Docker, no AWS apply.

**Tech Stack:** Terraform >= 1.5, `hashicorp/aws ~> 5.60`, `hashicorp/tls ~> 4.0`. Verification via the `hashicorp/terraform:1.9` Docker image (no local install). Docker is already running.

## Global Constraints

- **No `terraform apply`, no real AWS account, no credentials.** Offline verification only.
- **No secrets, real account IDs, or real CIDRs in the repo.** Everything is a variable; `terraform.tfvars.example` holds placeholder/example values only. AWS creds come from the environment at apply time, never a file.
- **Pinned versions**, no floats. Each module has its own `versions.tf` with `required_providers` (and NO `provider` block — providers are configured only at the root).
- **Local backend by default.** The S3 remote backend ships as a commented `backend.tf.example` so offline `validate` needs no bucket.
- Module directories already exist (empty): `infrastructure/modules/networking`, `infrastructure/modules/compute`.

### Verification commands (used throughout)

Let `IMG=hashicorp/terraform:1.9`. Run from the repo host (Docker mounts an absolute path):

- Root validate:
  ```
  docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 init -backend=false
  docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 validate
  docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 fmt -check -recursive
  ```
- Module-standalone validate (Tasks 1 & 2): mount the module dir instead, e.g.
  ```
  docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/networking:/work -w /work hashicorp/terraform:1.9 init -backend=false
  docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/networking:/work -w /work hashicorp/terraform:1.9 validate
  ```
- `init` needs network egress to the Terraform registry (to fetch providers) but makes NO AWS calls. `validate` and `fmt` are fully offline.
- After running, `.terraform/` and `.terraform.lock.hcl` appear in the mounted dir — these are gitignored in Task 4 (do not commit them).

---

### Task 1: networking module (VPC + subnets + NAT + routing)

**Files (all new):**
- `infrastructure/modules/networking/versions.tf`
- `infrastructure/modules/networking/variables.tf`
- `infrastructure/modules/networking/main.tf`
- `infrastructure/modules/networking/outputs.tf`

- [ ] **Step 1: Create `versions.tf`**

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}
```

- [ ] **Step 2: Create `variables.tf`**

```hcl
variable "name" {
  description = "Name prefix for networking resources (typically project-env)."
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name used to tag subnets for load balancer discovery."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to spread subnets across."
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 4
    error_message = "az_count must be between 2 and 4."
  }
}

variable "single_nat_gateway" {
  description = "Use one shared NAT gateway (cheaper) instead of one per AZ (HA)."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
```

- [ ] **Step 3: Create `main.tf`**

```hcl
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs                  = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  public_subnet_cidrs  = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 4, i)]
  private_subnet_cidrs = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 4, i + var.az_count)]
  nat_count            = var.single_nat_gateway ? 1 : var.az_count
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(var.tags, { Name = "${var.name}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-igw" })
}

resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags = merge(var.tags, {
    Name                                        = "${var.name}-public-${local.azs[count.index]}"
    "kubernetes.io/role/elb"                    = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  })
}

resource "aws_subnet" "private" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]
  tags = merge(var.tags, {
    Name                                        = "${var.name}-private-${local.azs[count.index]}"
    "kubernetes.io/role/internal-elb"           = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  })
}

resource "aws_eip" "nat" {
  count  = local.nat_count
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-nat-eip-${count.index}" })
}

resource "aws_nat_gateway" "this" {
  count         = local.nat_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = merge(var.tags, { Name = "${var.name}-nat-${count.index}" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(var.tags, { Name = "${var.name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = var.az_count
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[var.single_nat_gateway ? 0 : count.index].id
  }
  tags = merge(var.tags, { Name = "${var.name}-private-rt-${count.index}" })
}

resource "aws_route_table_association" "private" {
  count          = var.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}
```

- [ ] **Step 4: Create `outputs.tf`**

```hcl
output "vpc_id" {
  description = "VPC id."
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet ids (one per AZ)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet ids (one per AZ)."
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ids" {
  description = "NAT gateway ids."
  value       = aws_nat_gateway.this[*].id
}
```

- [ ] **Step 5: Verify (fmt + validate, standalone)**

```
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/networking:/work -w /work hashicorp/terraform:1.9 fmt -check -recursive
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/networking:/work -w /work hashicorp/terraform:1.9 init -backend=false
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/networking:/work -w /work hashicorp/terraform:1.9 validate
```
Expected: fmt clean (exit 0, no files listed), `validate` → "Success! The configuration is valid." Fix any formatting with `fmt` (no `-check`) and re-run.

- [ ] **Step 6: Commit** (do NOT add `.terraform/` or `.terraform.lock.hcl`)

```bash
cd ~/projects/shopflow
git add infrastructure/modules/networking/versions.tf infrastructure/modules/networking/variables.tf infrastructure/modules/networking/main.tf infrastructure/modules/networking/outputs.tf
git commit -m "feat(infra): networking module — VPC, multi-AZ subnets, NAT, routing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: compute module (EKS cluster + node group + IRSA + KMS)

**Files (all new):**
- `infrastructure/modules/compute/versions.tf`
- `infrastructure/modules/compute/variables.tf`
- `infrastructure/modules/compute/main.tf`
- `infrastructure/modules/compute/outputs.tf`

- [ ] **Step 1: Create `versions.tf`**

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}
```

- [ ] **Step 2: Create `variables.tf`**

```hcl
variable "cluster_name" {
  description = "EKS cluster name."
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS control plane."
  type        = string
  default     = "1.30"
}

variable "vpc_id" {
  description = "VPC the cluster is deployed into."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet ids for the cluster ENIs and worker nodes."
  type        = list(string)
}

variable "public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint. RESTRICT before a real apply — the default is permissive for convenience only."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group."
  type        = list(string)
  default     = ["t3.large"]
}

variable "node_desired_size" {
  description = "Desired worker node count."
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum worker node count."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum worker node count."
  type        = number
  default     = 4
}

variable "node_capacity_type" {
  description = "ON_DEMAND or SPOT capacity for the node group."
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "node_capacity_type must be ON_DEMAND or SPOT."
  }
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
```

- [ ] **Step 3: Create `main.tf`**

```hcl
data "aws_partition" "current" {}

# --- KMS key for EKS secrets envelope encryption ---
resource "aws_kms_key" "eks" {
  description             = "EKS secrets envelope encryption for ${var.cluster_name}"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = merge(var.tags, { Name = "${var.cluster_name}-eks-kms" })
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.cluster_name}-eks"
  target_key_id = aws_kms_key.eks.key_id
}

# --- Cluster IAM role ---
data "aws_iam_policy_document" "cluster_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  name               = "${var.cluster_name}-cluster-role"
  assume_role_policy = data.aws_iam_policy_document.cluster_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSClusterPolicy"
}

# --- EKS cluster ---
resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  version  = var.cluster_version
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.public_access_cidrs
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = var.tags

  depends_on = [aws_iam_role_policy_attachment.cluster_policy]
}

# --- IRSA / OIDC provider ---
data "tls_certificate" "oidc" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "oidc" {
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.oidc.certificates[0].sha1_fingerprint]
  tags            = var.tags
}

# --- Node group IAM role ---
data "aws_iam_policy_document" "node_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  name               = "${var.cluster_name}-node-role"
  assume_role_policy = data.aws_iam_policy_document.node_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "node_worker" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "node_ecr" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# --- Managed node group (in private subnets) ---
resource "aws_eks_node_group" "this" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.cluster_name}-ng"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = var.node_instance_types
  capacity_type   = var.node_capacity_type

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  update_config {
    max_unavailable = 1
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy_attachment.node_worker,
    aws_iam_role_policy_attachment.node_cni,
    aws_iam_role_policy_attachment.node_ecr,
  ]
}

# --- Core managed addons ---
resource "aws_eks_addon" "vpc_cni" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "vpc-cni"
  depends_on   = [aws_eks_node_group.this]
}

resource "aws_eks_addon" "coredns" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "coredns"
  depends_on   = [aws_eks_node_group.this]
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "kube-proxy"
  depends_on   = [aws_eks_node_group.this]
}
```

- [ ] **Step 4: Create `outputs.tf`**

```hcl
output "cluster_name" {
  description = "EKS cluster name."
  value       = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  description = "EKS API server endpoint."
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_certificate_authority" {
  description = "Base64 EKS cluster CA certificate."
  value       = aws_eks_cluster.this.certificate_authority[0].data
  sensitive   = true
}

output "cluster_security_group_id" {
  description = "Security group id EKS created for the control plane / managed nodes."
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "oidc_provider_arn" {
  description = "IRSA OIDC provider ARN."
  value       = aws_iam_openid_connect_provider.oidc.arn
}

output "oidc_issuer_url" {
  description = "EKS OIDC issuer URL."
  value       = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

output "node_group_name" {
  description = "Managed node group name."
  value       = aws_eks_node_group.this.node_group_name
}
```

- [ ] **Step 5: Verify (fmt + validate, standalone)**

```
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/compute:/work -w /work hashicorp/terraform:1.9 fmt -check -recursive
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/compute:/work -w /work hashicorp/terraform:1.9 init -backend=false
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/compute:/work -w /work hashicorp/terraform:1.9 validate
```
Expected: fmt clean, `validate` → "Success!". Fix formatting via `fmt` and re-run if needed.

- [ ] **Step 6: Commit** (exclude `.terraform/`, `.terraform.lock.hcl`)

```bash
cd ~/projects/shopflow
git add infrastructure/modules/compute/versions.tf infrastructure/modules/compute/variables.tf infrastructure/modules/compute/main.tf infrastructure/modules/compute/outputs.tf
git commit -m "feat(infra): compute module — EKS cluster, node group, KMS, IRSA, addons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: root composition (wires the two modules)

**Files (all new, in `infrastructure/`):**
- `versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`, `terraform.tfvars.example`, `backend.tf.example`

- [ ] **Step 1: Create `versions.tf`**

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}
```

- [ ] **Step 2: Create `variables.tf`**

```hcl
variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name, used as a resource name prefix and tag."
  type        = string
  default     = "shopflow"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones."
  type        = number
  default     = 3
}

variable "single_nat_gateway" {
  description = "One shared NAT gateway (cheaper) vs one per AZ (HA)."
  type        = bool
  default     = true
}

variable "cluster_version" {
  description = "EKS Kubernetes version."
  type        = string
  default     = "1.30"
}

variable "node_instance_types" {
  description = "Worker node instance types."
  type        = list(string)
  default     = ["t3.large"]
}

variable "public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint. Restrict before a real apply."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
```

- [ ] **Step 3: Create `main.tf`**

```hcl
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name         = "${var.project}-${var.environment}"
  cluster_name = "${var.project}-${var.environment}"
}

module "networking" {
  source = "./modules/networking"

  name               = local.name
  cluster_name       = local.cluster_name
  vpc_cidr           = var.vpc_cidr
  az_count           = var.az_count
  single_nat_gateway = var.single_nat_gateway
}

module "compute" {
  source = "./modules/compute"

  cluster_name        = local.cluster_name
  cluster_version     = var.cluster_version
  vpc_id              = module.networking.vpc_id
  private_subnet_ids  = module.networking.private_subnet_ids
  public_access_cidrs = var.public_access_cidrs
  node_instance_types = var.node_instance_types
}
```

- [ ] **Step 4: Create `outputs.tf`**

```hcl
output "vpc_id" {
  description = "VPC id."
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet ids."
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet ids."
  value       = module.networking.private_subnet_ids
}

output "cluster_name" {
  description = "EKS cluster name."
  value       = module.compute.cluster_name
}

output "cluster_endpoint" {
  description = "EKS API endpoint."
  value       = module.compute.cluster_endpoint
}

output "oidc_provider_arn" {
  description = "IRSA OIDC provider ARN."
  value       = module.compute.oidc_provider_arn
}
```

- [ ] **Step 5: Create `terraform.tfvars.example`**

```hcl
# Copy to terraform.tfvars and adjust. NO SECRETS here — VPC/EKS take no secrets;
# AWS credentials come from your environment (AWS_PROFILE / env vars / IAM role),
# never from this file.
region      = "us-east-1"
project     = "shopflow"
environment = "dev"

vpc_cidr           = "10.0.0.0/16"
az_count           = 3
single_nat_gateway = true

cluster_version     = "1.30"
node_instance_types = ["t3.large"]

# Restrict this to your office / VPN egress CIDRs before a real apply.
public_access_cidrs = ["0.0.0.0/0"]
```

- [ ] **Step 6: Create `backend.tf.example`**

```hcl
# Remote state backend (example — rename to backend.tf and create the bucket +
# lock table first). Left as .example so offline `terraform validate` uses the
# default local backend and needs no real S3 bucket.
#
# terraform {
#   backend "s3" {
#     bucket         = "shopflow-tfstate-<account-id>"
#     key            = "infrastructure/dev/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "shopflow-tflock"
#     encrypt        = true
#   }
# }
```

- [ ] **Step 7: Verify the full composition (root + both modules)**

```
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 fmt -check -recursive
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 init -backend=false
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 validate
```
Expected: fmt clean across all files; `validate` → "Success! The configuration is valid." This validates the root plus both child modules together.

- [ ] **Step 8: Commit**

```bash
cd ~/projects/shopflow
git add infrastructure/versions.tf infrastructure/variables.tf infrastructure/main.tf infrastructure/outputs.tf infrastructure/terraform.tfvars.example infrastructure/backend.tf.example
git commit -m "feat(infra): root composition wiring networking + compute (EKS foundation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: gitignore, PROMPT_LOG Entry 18, memory

**Files:** `.gitignore`, `PROMPT_LOG.md`, memory files.

- [ ] **Step 1: Ignore Terraform working files**

Append to `.gitignore`:

```
# Terraform
**/.terraform/*
*.tfstate
*.tfstate.*
crash.log
crash.*.log
*.tfvars
!*.tfvars.example
override.tf
override.tf.json
.terraform.lock.hcl
```

Then confirm nothing already-staged is ignored inappropriately: `git status --porcelain infrastructure/` should show only the `.tf` / `.example` source files across the three commits (already committed), and `git check-ignore infrastructure/.terraform/providers` should report it ignored if present.

- [ ] **Step 2: Final full validate (regression guard)**

Re-run the Task 3 Step 7 block once more to confirm the whole `infrastructure/` tree is still fmt-clean and valid.

- [ ] **Step 3: Fill PROMPT_LOG Entry 18**

Replace the Entry 18 stub: Tool Used (Claude Code, Opus 4.8; superpowers pipeline), the verbatim prompt, Output Quality, What You Changed (networking + compute modules, root composition, tfvars/backend examples, spec/plan under `docs/superpowers/`), What You Learned (hand-authored modules; offline `validate` in Docker with `init -backend=false` so no AWS creds needed; security baked in — KMS secrets encryption, audit logging, private nodes, IRSA; `apply` deliberately out of scope). Use the same honest markers as E27/E28 for the verbatim prompt (`_[Umair: confirm exact wording]_`) and the rating (`_(Umair to rate)_`).

- [ ] **Step 4: Update memory**

`shopflow_project.md`: Domain 4 foundation (E18) done — Terraform VPC + EKS modules, offline-validated. Note remaining Domain 4: E20 CloudFront, E21 k8s manifests, E19 Well-Architected review, E22 infracost. `shopflow_conventions.md`: add the "Terraform validated offline in Docker (`hashicorp/terraform:1.9`, `init -backend=false` + `validate` + `fmt -check`); no apply, no secrets in repo, `.tfvars` gitignored" convention. Update `MEMORY.md` index lines.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/shopflow
git add .gitignore PROMPT_LOG.md
git commit -m "docs(infra): fill PROMPT_LOG Entry 18; gitignore terraform artifacts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- networking module (VPC, 3-AZ public+private subnets, IGW, NAT, routing, EKS subnet tags) → Task 1. ✓
- compute module (EKS cluster, managed node group in private subnets, KMS secrets encryption, control-plane logging, IRSA OIDC, core addons) → Task 2. ✓
- root composition wiring the two + version pins + tfvars/backend examples → Task 3. ✓
- Offline fmt+validate via Docker, no apply/creds → verification steps in every task. ✓
- No secrets in repo; placeholders only → `terraform.tfvars.example`, `.tfvars` gitignored (Task 4). ✓

**2. Placeholder scan:** Every code step carries full literal HCL; no "TBD"/"similar to". ✓

**3. Interface consistency:** root passes `module.networking.vpc_id` / `.private_subnet_ids` into `module.compute` (vars `vpc_id`, `private_subnet_ids`); `cluster_name` used consistently for subnet tags and the compute module; module `versions.tf` files declare `required_providers` with NO provider block (config only at root). ✓

**4. Terraform-correctness guards:**
- `aws_eip.domain = "vpc"` (v5 syntax, not the deprecated `vpc = true`). ✓
- OIDC issuer referenced as `aws_eks_cluster.this.identity[0].oidc[0].issuer`; thumbprint from `data.tls_certificate` (`tls` provider pinned). ✓
- Managed IAM policy ARNs built with `data.aws_partition.current.partition` (not a hardcoded `aws` partition). ✓
- `aws_eks_node_group` has `depends_on` on the three node policy attachments (AWS requires them before node creation). ✓
- Private route tables index NAT via `var.single_nat_gateway ? 0 : count.index` so a single shared NAT works with per-AZ route tables. ✓
- `cluster_certificate_authority` output marked `sensitive`. ✓
- `.terraform/` and `.terraform.lock.hcl` generated during validate are gitignored, not committed. ✓

**5. Risks / notes:**
- `init` requires network egress to the Terraform registry (providers), but never contacts AWS; `validate`/`fmt` are fully offline. If the Docker registry pull is blocked, validate can't run.
- `public_access_cidrs` default `0.0.0.0/0` is intentional for validate convenience and loudly flagged; a real apply must restrict it.
- Provider `~> 5.60` is recent enough for all resources/attributes used; if the container resolves a much newer major it could warn, but `~>` caps at 5.x.
- No `terraform plan` — unknown-value resolution (e.g. OIDC issuer) is only exercised at apply time, out of scope here.
