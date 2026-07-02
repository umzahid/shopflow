provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name         = "${var.project}-${var.environment}"
  cluster_name = "${var.project}-${var.environment}"
}

module "networking" {
  source = "./modules/networking"

  name               = local.name
  cluster_name       = local.cluster_name
  vpc_cidr           = var.vpc_cidr
  az_count           = var.az_count
  single_nat_gateway = var.single_nat_gateway
}

module "compute" {
  source = "./modules/compute"

  cluster_name        = local.cluster_name
  cluster_version     = var.cluster_version
  vpc_id              = module.networking.vpc_id
  private_subnet_ids  = module.networking.private_subnet_ids
  public_access_cidrs = var.public_access_cidrs
  node_instance_types = var.node_instance_types
}
