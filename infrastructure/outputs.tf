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
