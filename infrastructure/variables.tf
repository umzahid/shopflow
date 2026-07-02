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
