# CloudFront CDN Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Add a `cdn` Terraform module (private S3 origin + OAC + CloudFront distribution + managed cache/origin-request policies + security-headers response policy + conditional TLS + optional WAF/logging), wire it into the root, all `fmt`- and `validate`-clean — verified offline in Docker, no AWS apply.

**Tech Stack:** Terraform >= 1.5, `hashicorp/aws ~> 5.60`. Verify via `hashicorp/terraform:1.9` Docker image (already pulled).

## Global Constraints

- No `apply`, no AWS account, no credentials. Offline `fmt` + `init -backend=false` + `validate` only.
- No secrets/account IDs/bucket names hardcoded — `bucket_prefix` yields a unique bucket name at apply; optional inputs (`acm_certificate_arn`, `web_acl_id`, `log_bucket_domain_name`) default null.
- Module has its own `versions.tf` with `required_providers` and NO provider block.
- Do NOT commit `.terraform/` or `.terraform.lock.hcl` (already gitignored).

### Verification commands

`IMG=hashicorp/terraform:1.9`. Module standalone:
```
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/cdn:/work -w /work hashicorp/terraform:1.9 fmt -check -recursive
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/cdn:/work -w /work hashicorp/terraform:1.9 init -backend=false
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure/modules/cdn:/work -w /work hashicorp/terraform:1.9 validate
```
Root (Task 2):
```
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 fmt -check -recursive
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 init -backend=false
docker run --rm -v /Users/emumba/projects/shopflow/infrastructure:/work -w /work hashicorp/terraform:1.9 validate
```
If `fmt -check` lists files, re-run without `-check` to auto-format. `validate` must print "Success! The configuration is valid."

---

### Task 1: `cdn` module

**Files (all new in `infrastructure/modules/cdn/`):** `versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`.

- [ ] **Step 1: `versions.tf`**

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

- [ ] **Step 2: `variables.tf`**

```hcl
variable "name" {
  description = "Name prefix for CDN resources (typically project-env)."
  type        = string
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_100 | PriceClass_200 | PriceClass_All)."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "default_root_object" {
  description = "Object returned for a request to the distribution root."
  type        = string
  default     = "index.html"
}

variable "aliases" {
  description = "Custom domain names (CNAMEs) for the distribution. Requires acm_certificate_arn."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) for the custom domains. Null uses the default CloudFront certificate."
  type        = string
  default     = null
}

variable "web_acl_id" {
  description = "Optional WAFv2 web ACL ARN to associate. Null disables WAF."
  type        = string
  default     = null
}

variable "log_bucket_domain_name" {
  description = "Optional S3 bucket domain for CloudFront access logs (e.g. my-logs.s3.amazonaws.com). Null disables logging."
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
```

- [ ] **Step 3: `main.tf`**

```hcl
# --- Private S3 origin bucket ---
resource "aws_s3_bucket" "origin" {
  bucket_prefix = "${var.name}-assets-"
  tags          = merge(var.tags, { Name = "${var.name}-static-assets" })
}

resource "aws_s3_bucket_public_access_block" "origin" {
  bucket                  = aws_s3_bucket.origin.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "origin" {
  bucket = aws_s3_bucket.origin.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "origin" {
  bucket = aws_s3_bucket.origin.id
  versioning_configuration {
    status = "Enabled"
  }
}

# --- Origin Access Control (OAC) ---
resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name}-oac"
  description                       = "OAC for ${var.name} static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --- Managed policies (data sources) ---
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "cors_s3" {
  name = "Managed-CORS-S3Origin"
}

# --- Security headers response policy ---
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${var.name}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

# --- Distribution ---
locals {
  origin_id = "${var.name}-s3-origin"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name} static asset CDN"
  price_class         = var.price_class
  default_root_object = var.default_root_object
  aliases             = var.aliases
  web_acl_id          = var.web_acl_id

  origin {
    origin_id                = local.origin_id
    domain_name              = aws_s3_bucket.origin.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.cors_s3.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == null
    acm_certificate_arn            = var.acm_certificate_arn
    ssl_support_method             = var.acm_certificate_arn == null ? null : "sni-only"
    minimum_protocol_version       = var.acm_certificate_arn == null ? "TLSv1" : "TLSv1.2_2021"
  }

  dynamic "logging_config" {
    for_each = var.log_bucket_domain_name == null ? [] : [1]
    content {
      bucket          = var.log_bucket_domain_name
      include_cookies = false
      prefix          = "${var.name}/"
    }
  }

  tags = merge(var.tags, { Name = "${var.name}-cdn" })
}

# --- Bucket policy: allow the distribution read via OAC ---
data "aws_iam_policy_document" "origin" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.origin.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "origin" {
  bucket = aws_s3_bucket.origin.id
  policy = data.aws_iam_policy_document.origin.json
}
```

- [ ] **Step 4: `outputs.tf`**

```hcl
output "distribution_id" {
  description = "CloudFront distribution id."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.this.arn
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name (e.g. d111111abcdef8.cloudfront.net)."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_hosted_zone_id" {
  description = "CloudFront hosted zone id (for Route 53 alias records)."
  value       = aws_cloudfront_distribution.this.hosted_zone_id
}

output "origin_bucket_name" {
  description = "Static-assets S3 origin bucket name."
  value       = aws_s3_bucket.origin.id
}

output "origin_bucket_arn" {
  description = "Static-assets S3 origin bucket ARN."
  value       = aws_s3_bucket.origin.arn
}

output "oac_id" {
  description = "Origin Access Control id."
  value       = aws_cloudfront_origin_access_control.this.id
}
```

- [ ] **Step 5: Verify (standalone)** — run the module-standalone block above. `fmt -check` clean; `validate` → "Success!". Fix formatting with `fmt` (no `-check`) if needed.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/shopflow
git add infrastructure/modules/cdn/versions.tf infrastructure/modules/cdn/variables.tf infrastructure/modules/cdn/main.tf infrastructure/modules/cdn/outputs.tf
git commit -m "feat(infra): cdn module — CloudFront over private S3 origin (OAC, security headers)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: wire `cdn` into the root

**Files (modify in `infrastructure/`):** `variables.tf`, `main.tf`, `outputs.tf`, `terraform.tfvars.example`.

- [ ] **Step 1: Append CDN variables to `variables.tf`**

```hcl
variable "cdn_price_class" {
  description = "CloudFront price class for the CDN."
  type        = string
  default     = "PriceClass_100"
}

variable "cdn_aliases" {
  description = "Custom domain names for the CDN (requires cdn_acm_certificate_arn)."
  type        = list(string)
  default     = []
}

variable "cdn_acm_certificate_arn" {
  description = "ACM cert ARN (us-east-1) for CDN custom domains. Null uses the default CloudFront cert."
  type        = string
  default     = null
}
```

- [ ] **Step 2: Append the `cdn` module block to `main.tf`**

```hcl
module "cdn" {
  source = "./modules/cdn"

  name                = local.name
  price_class         = var.cdn_price_class
  aliases             = var.cdn_aliases
  acm_certificate_arn = var.cdn_acm_certificate_arn
}
```

- [ ] **Step 3: Append CDN outputs to `outputs.tf`**

```hcl
output "cdn_distribution_domain_name" {
  description = "CloudFront distribution domain name."
  value       = module.cdn.distribution_domain_name
}

output "cdn_distribution_id" {
  description = "CloudFront distribution id."
  value       = module.cdn.distribution_id
}

output "cdn_origin_bucket_name" {
  description = "CDN static-assets origin bucket name."
  value       = module.cdn.origin_bucket_name
}
```

- [ ] **Step 4: Append to `terraform.tfvars.example`**

```hcl

# CloudFront CDN
cdn_price_class = "PriceClass_100"
# cdn_aliases             = ["cdn.example.com"]
# cdn_acm_certificate_arn = "arn:aws:acm:us-east-1:<account-id>:certificate/<id>"
```

- [ ] **Step 5: Verify (full root + all modules)** — run the root verification block. `fmt -check -recursive` clean; `validate` → "Success!" with `module.cdn` wired alongside networking + compute.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/shopflow
git add infrastructure/variables.tf infrastructure/main.tf infrastructure/outputs.tf infrastructure/terraform.tfvars.example
git commit -m "feat(infra): wire cdn (CloudFront) module into root composition

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PROMPT_LOG Entry 20, memory (orchestrator handles this)

- [ ] **Step 1: Final full validate** — re-run the root verification block as a regression guard.

- [ ] **Step 2: Fill PROMPT_LOG Entry 20** — Tool Used (Claude Code, Opus 4.8; superpowers pipeline), verbatim prompt (`_[Umair: confirm exact wording]_`), Output Quality (`_(Umair to rate)_`), What You Changed (cdn module: private S3 origin, OAC, distribution with managed policies + security headers + conditional TLS + optional WAF/logging; root wiring; spec/plan), What You Learned (OAC replaces OAI; bucket-policy SourceArn scoping avoids a cycle; managed cache/origin-request policies via data sources; security headers at the edge; validated offline, no apply).

- [ ] **Step 3: Update memory** — `shopflow_project.md`: Domain 4 E20 done (CloudFront), 2 of 5; remaining E19 Well-Architected, E21 k8s, E22 infracost. Update `MEMORY.md` index if needed.

- [ ] **Step 4: Commit** `PROMPT_LOG.md` (`docs(infra): fill PROMPT_LOG Entry 20`).

---

## Self-Review

**1. Spec coverage:** private S3 origin + public-access block + SSE + versioning (Task 1 Step 3); OAC + SourceArn-scoped bucket policy (Step 3); managed cache/origin-request policies via data sources; custom security-headers response policy; distribution with redirect-to-https, conditional TLS, optional WAF (`web_acl_id`) + logging (`dynamic logging_config`); root wiring + outputs (Task 2). ✓

**2. Placeholder scan:** every step carries full literal HCL. ✓

**3. Terraform-correctness guards:**
- Dependency chain bucket → OAC → distribution → bucket_policy is linear (bucket_policy references the distribution ARN; the bucket does not reference the distribution) — **no cycle**. ✓
- OAC via `aws_cloudfront_origin_access_control` (not legacy OAI); origin uses `origin_access_control_id` + `bucket_regional_domain_name` (no `s3_origin_config`). ✓
- `viewer_certificate` conditional sets `minimum_protocol_version = "TLSv1"` for the default cert (AWS requirement) and `TLSv1.2_2021` for ACM; `ssl_support_method` null unless ACM. ✓
- Optional `logging_config` via `dynamic` with `for_each` gated on null; `web_acl_id` passes null when unset. ✓
- Managed policies fetched by `data.aws_cloudfront_cache_policy` / `..._origin_request_policy` (resolve at plan; validate-safe). ✓
- `bucket_prefix` (not `bucket`) for global uniqueness. ✓

**4. Interface consistency:** root passes `name`, `price_class`, `aliases`, `acm_certificate_arn`; module outputs `distribution_domain_name`/`distribution_id`/`origin_bucket_name` re-exported at root. No secret outputs (distribution domain/id/bucket name are non-secret). ✓

**5. Risks / notes:**
- `viewer_certificate` with both `cloudfront_default_certificate = true` and `acm_certificate_arn = null` validates fine; at apply only one path is active via the conditional. Not exercised without apply.
- Managed-policy data sources need AWS at plan/apply; `validate` does not call AWS, so this is only confirmed structurally here.
- The module owns its origin bucket (documented spec decision); revisit if the `storage` module later provides the product-image bucket.
