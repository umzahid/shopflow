variable "name" {
  description = "Name prefix (e.g. shopflow-dev)."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log group retention."
  type        = number
  default     = 30
}

variable "billing_threshold_usd" {
  description = "Alarm when estimated charges exceed this (USD)."
  type        = number
  default     = 50
}

variable "alarm_email" {
  description = "Optional email for billing/ops alerts. Empty = topic only."
  type        = string
  default     = ""
}
