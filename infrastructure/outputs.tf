output "vpc_id" {
  description = "VPC id."
  value       = module.networking.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet ids."
  value       = module.networking.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet ids."
  value       = module.networking.private_subnet_ids
}

output "cluster_name" {
  description = "EKS cluster name."
  value       = module.compute.cluster_name
}

output "cluster_endpoint" {
  description = "EKS API endpoint."
  value       = module.compute.cluster_endpoint
}

output "oidc_provider_arn" {
  description = "IRSA OIDC provider ARN."
  value       = module.compute.oidc_provider_arn
}

output "cdn_distribution_domain_name" {
  description = "CloudFront distribution domain name."
  value       = module.cdn.distribution_domain_name
}

output "cdn_distribution_id" {
  description = "CloudFront distribution id."
  value       = module.cdn.distribution_id
}

output "cdn_origin_bucket_name" {
  description = "CDN static-assets origin bucket name."
  value       = module.cdn.origin_bucket_name
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint."
  value       = module.database.rds_endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint."
  value       = module.database.redis_endpoint
}

output "db_secret_arn" {
  description = "Secrets Manager ARN with DB credentials."
  value       = module.database.db_secret_arn
}

output "product_images_bucket" {
  description = "S3 product-images bucket name."
  value       = module.storage.bucket_id
}

output "route53_zone_id" {
  description = "Hosted zone id for the app domain."
  value       = module.route53.zone_id
}

output "route53_name_servers" {
  description = "Delegation name servers for the hosted zone."
  value       = module.route53.name_servers
}
