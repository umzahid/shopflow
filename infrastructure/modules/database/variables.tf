variable "name" {
  description = "Name prefix (e.g. shopflow-dev)."
  type        = string
}

variable "vpc_id" {
  description = "VPC to place the DB/cache in."
  type        = string
}

variable "vpc_cidr_block" {
  description = "VPC CIDR — the only source allowed to reach the DB/cache."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for the DB/cache subnet groups."
  type        = list(string)
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.medium"
}

variable "db_multi_az" {
  description = "Multi-AZ RDS (HA). Off for dev to save cost."
  type        = bool
  default     = true
}

variable "db_username" {
  description = "Master DB username."
  type        = string
  default     = "shopflow"
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t3.micro"
}

variable "backup_retention_days" {
  description = "RDS automated backup retention."
  type        = number
  default     = 7
}
