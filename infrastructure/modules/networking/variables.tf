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
