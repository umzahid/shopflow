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

  cluster_name           = local.cluster_name
  cluster_version        = var.cluster_version
  private_subnet_ids     = module.networking.private_subnet_ids
  endpoint_public_access = var.endpoint_public_access
  public_access_cidrs    = var.public_access_cidrs
  node_instance_types    = var.node_instance_types
}

module "cdn" {
  source = "./modules/cdn"

  name                   = local.name
  price_class            = var.cdn_price_class
  aliases                = var.cdn_aliases
  acm_certificate_arn    = var.cdn_acm_certificate_arn
  web_acl_id             = var.cdn_web_acl_id
  log_bucket_domain_name = var.cdn_log_bucket_domain_name
}
