variable "name" {
  description = "Name prefix (e.g. shopflow-dev)."
  type        = string
}

variable "ia_transition_days" {
  description = "Days before objects move to STANDARD_IA."
  type        = number
  default     = 30
}

variable "glacier_transition_days" {
  description = "Days before objects move to GLACIER."
  type        = number
  default     = 90
}
