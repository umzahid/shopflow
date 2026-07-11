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
  description = "Number of Availability Zones. 2 keeps NAT/subnet footprint minimal for dev."
  type        = number
  default     = 2
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
  description = "Worker node instance types. t3.small is the practical EKS minimum (ENI pod limits); size up for the ML features."
  type        = list(string)
  default     = ["t3.small"]
}

variable "node_capacity_type" {
  description = "ON_DEMAND or SPOT capacity for EKS worker nodes. SPOT suits interruption-tolerant environments (staging)."
  type        = string
  default     = "ON_DEMAND"
}

variable "endpoint_public_access" {
  description = "Expose the EKS API endpoint publicly. Private access is always on; set false for prod."
  type        = bool
  default     = true
}

variable "public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint (only when endpoint_public_access is true). Restrict before a real apply."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

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

variable "cdn_web_acl_id" {
  description = "Optional WAFv2 web ACL ARN (us-east-1) to associate with the CDN. Null disables WAF."
  type        = string
  default     = null
}

variable "cdn_log_bucket_domain_name" {
  description = "Optional S3 bucket domain for CloudFront access logs. Null disables logging."
  type        = string
  default     = null
}

# ── DNS ─────────────────────────────────────────────────────────────────────
variable "dns_domain_name" {
  description = "Route 53 hosted-zone domain. Defaults to a reserved documentation domain (PRD: mock domain acceptable); set a real one when available."
  type        = string
  default     = "shopflow.example"
}

# ── Tagging (Well-Architected cost allocation) ──────────────────────────────
variable "owner" {
  description = "Owner tag applied to every resource."
  type        = string
  default     = "platform-team"
}

variable "cost_center" {
  description = "CostCenter tag applied to every resource."
  type        = string
  default     = "engineering"
}

# ── Database / cache ────────────────────────────────────────────────────────
variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.medium"
}

variable "db_multi_az" {
  description = "Multi-AZ RDS. Off for dev/staging to save cost."
  type        = bool
  default     = true
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t3.micro"
}

# ── Monitoring ──────────────────────────────────────────────────────────────
variable "billing_threshold_usd" {
  description = "Billing alarm threshold (USD)."
  type        = number
  default     = 50
}

variable "alarm_email" {
  description = "Optional email for billing/ops alerts."
  type        = string
  default     = ""
}
