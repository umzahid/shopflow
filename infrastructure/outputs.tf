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
