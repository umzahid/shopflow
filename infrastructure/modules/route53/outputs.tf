output "zone_id" {
  description = "Hosted zone id."
  value       = aws_route53_zone.this.zone_id
}

output "name_servers" {
  description = "Delegation name servers for the hosted zone."
  value       = aws_route53_zone.this.name_servers
}

output "app_fqdn" {
  description = "Storefront record name."
  value       = aws_route53_record.app.fqdn
}

output "api_fqdn" {
  description = "API record name."
  value       = aws_route53_record.api.fqdn
}
