variable "name" {
  description = "Name prefix (e.g. shopflow-dev)."
  type        = string
}

variable "domain_name" {
  description = "Hosted-zone domain. A mock/documentation domain is acceptable per the PRD."
  type        = string
}

variable "app_alias_domain_name" {
  description = "Alias target for app.<domain> — the CloudFront distribution domain name."
  type        = string
}

variable "app_alias_zone_id" {
  description = "Hosted zone id of the alias target (CloudFront's fixed zone id)."
  type        = string
}

variable "api_placeholder_ip" {
  description = "A-record target for api.<domain>. The EKS ingress ALB only exists after the in-cluster controller provisions it, so a TEST-NET-3 documentation IP stands in until then."
  type        = string
  default     = "203.0.113.10"
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
