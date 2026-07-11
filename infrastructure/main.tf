provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = var.owner
      CostCenter  = var.cost_center
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
  node_capacity_type     = var.node_capacity_type
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

module "storage" {
  source = "./modules/storage"

  name = local.name
}

module "route53" {
  source = "./modules/route53"

  name                  = local.name
  domain_name           = var.dns_domain_name
  app_alias_domain_name = module.cdn.distribution_domain_name
  app_alias_zone_id     = module.cdn.distribution_hosted_zone_id
}

module "database" {
  source = "./modules/database"

  name               = local.name
  vpc_id             = module.networking.vpc_id
  vpc_cidr_block     = module.networking.vpc_cidr_block
  private_subnet_ids = module.networking.private_subnet_ids
  db_instance_class  = var.db_instance_class
  db_multi_az        = var.db_multi_az
  redis_node_type    = var.redis_node_type
}

module "monitoring" {
  source = "./modules/monitoring"

  name                  = local.name
  billing_threshold_usd = var.billing_threshold_usd
  alarm_email           = var.alarm_email
}
