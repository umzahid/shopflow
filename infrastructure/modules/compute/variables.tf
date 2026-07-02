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
