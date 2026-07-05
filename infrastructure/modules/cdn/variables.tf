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
