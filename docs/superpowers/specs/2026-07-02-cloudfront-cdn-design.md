# CloudFront CDN Module — Design Spec

**Date:** 2026-07-02
**Assignment task:** Domain 4 — Entry 20 (CloudFront distribution config)
**Status:** DRAFT — pending approval before implementation plan

## Purpose

A `cdn` Terraform module that fronts ShopFlow's static assets / product images
with a CloudFront distribution over a private S3 origin, using **Origin Access
Control (OAC)** so the bucket is never public. Security headers, TLS, and cache
behavior are configured at the edge. Like E18, this is **validated IaC** — no
`apply`, no AWS account, no credentials; verified offline with `terraform fmt`
+ `init -backend=false` + `validate` in the `hashicorp/terraform:1.9` Docker image.

## Decisions (proposed — confirm before plan)

- **S3 origin owned by the `cdn` module.** The module creates its own private,
  encrypted, versioned static-assets bucket (public access fully blocked) as the
  CloudFront origin. This keeps E20 self-contained and validatable without
  depending on the not-yet-built `storage` module. (The `storage` module stays
  reserved for application data / product-image uploads; a note documents that a
  future revision could point CloudFront at that bucket instead.)
- **OAC, not the legacy OAI.** `aws_cloudfront_origin_access_control` (SigV4,
  `always`/`no-override`), with the S3 bucket policy granting `s3:GetObject` to
  `cloudfront.amazonaws.com` scoped by `AWS:SourceArn = distribution ARN`.
- **Managed cache/origin-request policies via data sources** (`Managed-
  CachingOptimized`, `Managed-CORS-S3Origin`) rather than hand-rolled — AWS best
  practice; less to maintain.
- **Custom security-headers response policy** (HSTS, X-Content-Type-Options,
  frame DENY, referrer-policy, XSS) — fits the ISO 27001 context and mirrors the
  backend's existing security headers at the edge.
- **TLS:** default CloudFront certificate unless a custom `acm_certificate_arn`
  (+ `aliases`) is supplied — a conditional `viewer_certificate` picks the right
  `minimum_protocol_version` (`TLSv1` for the default cert as AWS requires, else
  `TLSv1.2_2021`).
- **Optional WAF + access logging** exposed as variables (`web_acl_id`,
  `log_bucket_domain_name`), both default off/null so the module validates
  self-contained. `price_class` is a variable (default `PriceClass_100`).
- **Version pins** identical to E18 (`terraform >= 1.5`, `aws ~> 5.60`); the
  module has its own `versions.tf` with `required_providers` and no provider block.

## Architecture & components

```
infrastructure/modules/cdn/
  versions.tf    terraform + aws ~> 5.60 (required_providers only)
  variables.tf   name, tags, price_class, default_root_object, aliases,
                 acm_certificate_arn, web_acl_id, log_bucket_domain_name
  main.tf        - aws_s3_bucket (bucket_prefix for global uniqueness)
                 - aws_s3_bucket_public_access_block (all 4 = true)
                 - aws_s3_bucket_server_side_encryption_configuration (AES256)
                 - aws_s3_bucket_versioning (Enabled)
                 - aws_cloudfront_origin_access_control (sigv4/always)
                 - data.aws_cloudfront_cache_policy Managed-CachingOptimized
                 - data.aws_cloudfront_origin_request_policy Managed-CORS-S3Origin
                 - aws_cloudfront_response_headers_policy (security headers)
                 - aws_cloudfront_distribution (S3 origin + OAC, default behavior
                   redirect-to-https, GET/HEAD, the policies above, conditional
                   viewer_certificate, optional web_acl_id + logging_config,
                   restrictions{none})
                 - aws_s3_bucket_policy (OAC read, SourceArn = distribution.arn)
  outputs.tf     distribution_id, distribution_arn, distribution_domain_name,
                 distribution_hosted_zone_id, origin_bucket_name,
                 origin_bucket_arn, oac_id
```

**OAC ↔ bucket-policy cycle avoidance:** the bucket policy references
`aws_cloudfront_distribution.this.arn`; the distribution references the bucket's
`bucket_regional_domain_name` and the OAC id. That's a linear dependency
(bucket → OAC → distribution → bucket policy), no cycle.

## Root composition changes

- `module "cdn"` added to `infrastructure/main.tf` (name = `local.name`,
  `price_class`, tags via provider default_tags — passes only non-secret inputs).
- New root variables: `cdn_price_class` (default `PriceClass_100`),
  `cdn_aliases` (default `[]`), `cdn_acm_certificate_arn` (default `null`).
- New root outputs: `cdn_distribution_domain_name`, `cdn_distribution_id`,
  `cdn_origin_bucket_name`.

## Security & policy notes (ISMS-aware — draft, pending control-owner review)

- Origin bucket is private (public access block on all four settings); content is
  reachable **only** through CloudFront via OAC — no direct S3 URL access.
- SSE-S3 (AES256) at rest; versioning on (recover overwritten/deleted objects).
- HTTPS enforced at the viewer (`redirect-to-https`); HSTS + hardening headers via
  the response-headers policy.
- WAF association and access logging are wired as optional inputs — **recommended
  for prod** and called out as drafted-not-enabled by default.
- No secrets, bucket names, or account IDs hardcoded; `bucket_prefix` yields a
  globally unique name at apply time.

## Testing / verification (offline, no cloud, no creds)

Same as E18, via `hashicorp/terraform:1.9` Docker:
1. `fmt -check -recursive` (module standalone, then root).
2. `init -backend=false` (fetches aws provider; no AWS calls).
3. `validate` → "Success!" for the `cdn` module standalone AND for the root with
   `module.cdn` wired in.

No apply/plan (needs an account); managed-policy data sources and OAC SourceArn
only resolve at apply.

## Scope

**In:** `cdn` module (private S3 origin + OAC + distribution + managed cache/
origin-request policies + security-headers response policy + conditional TLS +
optional WAF/logging), root wiring, version pins; offline fmt+validate.

**Out (later / future):**
- Pointing CloudFront at the EKS/ALB app origin (composes with E21 k8s Ingress).
- ACM certificate + Route 53 record provisioning for a real custom domain.
- The `storage` module (application/product-image bucket).
- Enabling WAF/logging by default (left as opt-in variables).
- Any `terraform apply`.

## Follow-up after implementation

- Fill `PROMPT_LOG.md` Entry 20.
- Update memory (`shopflow_project.md` — Domain 4 E20 done; note remaining E19/E21/E22).
- Verify with the exact Docker fmt/validate commands before committing.
